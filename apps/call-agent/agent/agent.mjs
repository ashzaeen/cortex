import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-google';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent, usesOwnLiveKit } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { callIdFromIdentity, createCortexClient, localApiWarning, memoryActions } from './cortex.mjs';
import { cortexTools } from './cortex-tools.mjs';
import { startCallerVision } from './vision.mjs';

// Cortex on a FaceTime call. Keep replies conversational: the caller hears them, they do not read them.
const instructions = `You are Cortex, a second brain, on a FaceTime video call. You remember what the caller saw and heard in earlier moments. The caller sees a simple animated face while you talk.
Memory: for anything about the caller's past (what someone said or promised, what is open with a person, where something is), call ask_memory first and answer only from what it returns. If it says nothing is saved, say so plainly; never guess. If the caller asks to be briefed on a person, call brief_person.
Camera: you can see the caller through still images from their FaceTime camera, refreshed about once a second. Use what you see when it helps, for example reading a business card or a whiteboard they hold up. Only describe what is actually in the most recent image. If you cannot see anything useful, the camera seems off, or the picture is unclear, say so and ask the caller to adjust. The picture may include FaceTime buttons or a small preview of the caller's own video, so do not mistake those for objects in the room.
Saving: when the caller asks you to save or remember what they are showing, call save_what_you_see with a one-line note, then say it is saved. Never save on your own. If it says capture is paused, tell the caller.
Email: when the caller asks you to email or follow up with someone in memory, call draft_followup with their name, read the subject and one short sentence of the draft, and ask "Shall I send it?". Only after the caller clearly says yes, call send_followup with caller_said_yes true, then say it goes out in about 30 seconds and they can say "undo that". If they say undo, call undo_followup. Never send without a yes. You cannot choose the recipient or write a different email.
Do not guess who a person is or make assumptions about their age, health, or other personal traits from how they look. People are only known from what the caller tells you or from memory.
Keep each reply to one to three short, spoken-style sentences, and ask a clarifying question when a request is vague.
You cannot browse the web or place calls, and apart from that one follow-up email and saving what you see you cannot take actions, so say so plainly if asked. Be clear that you are an AI.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence: say you are Cortex, an AI, and ask how you can help.';

const agent = defineAgent({
  entry: async ctx => {
    // Subscribe to every track, not just audio: the caller's camera arrives as a video track.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    const caller = await ctx.waitForParticipant();

    // Cortex: tell the dashboard a call is live, and give the model its memory tools. Never blocks the call.
    const callId = callIdFromIdentity(caller.identity);
    const cortex = createCortexClient();
    console.log(JSON.stringify({ cortex: 'call', callId, api: cortex.baseUrl }));
    const started = cortex.callStarted(callId);
    ctx.addShutdownCallback(async () => {
      await started; // never report the end before the start
      await cortex.callEnded(callId);
    });
    let latestFrame = null; // the newest caller camera picture, saved only when the caller asks
    const tools = cortexTools(memoryActions({ client: cortex, callId, getLatestFrame: () => latestFrame }));

    // Video: one camera track, published by this agent. The Mac shows video only
    // from the participant that speaks, so the picture and the voice stay together.
    const source = new VideoSource(WIDTH, HEIGHT);
    const track = LocalVideoTrack.createVideoTrack('agent-video', source);
    let tick = 0, speaking = false;
    const frame = () => source.captureFrame(new VideoFrame(drawFace(tick++, speaking), WIDTH, HEIGHT, VideoBufferType.RGBA));
    frame();
    await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
    const timer = setInterval(frame, 1000 / FPS);

    const llm = new realtime.RealtimeModel({ model: 'gemini-2.5-flash-native-audio-preview-12-2025', voice: 'Puck' });
    // Remember the live Gemini session so caller camera frames can be sent into it.
    let liveSession;
    const createSession = llm.session.bind(llm);
    llm.session = (...args) => (liveSession = createSession(...args));
    const session = new voice.AgentSession({ llm });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, event => { speaking = event.newState === 'speaking'; });
    let stopVision = () => {};
    ctx.addShutdownCallback(async () => {
      stopVision();
      clearInterval(timer);
      await session.close();
      await track.close();
      await source.close();
    });
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions, tools }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false, // the Node framework does not route video to the model; vision.mjs does it
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Caller vision: forward the caller's camera (facetime-remote-video) to Gemini as still images.
    stopVision = startCallerVision(ctx.room, caller.identity, () => liveSession, jpeg => { latestFrame = { jpeg, at: Date.now() }; });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: greeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Hosted setups fail quietly if the Cortex API address is still the local mock, so say so at startup.
const apiWarning = process.env.CORTEX_WARNED ? null : localApiWarning(process.env.CORTEX_API_URL, usesOwnLiveKit());
if (apiWarning) {
  console.warn(JSON.stringify({ cortex: 'warning', message: apiWarning }));
  process.env.CORTEX_WARNED = '1'; // the worker's job processes re-import this file and inherit the env: say it once
}

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });
