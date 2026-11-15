import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-google';
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { drawFace, FPS, HEIGHT, WIDTH } from './face.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { startCallerVision } from './vision.mjs';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are a friendly, practical AI assistant on a FaceTime video call.
The caller sees a simple animated face while you talk.
Help the caller with everyday tasks: answering questions, explaining things simply, planning, cooking and recipes, quick math and unit conversions, writing or rewording short messages, brainstorming, and general how-to advice.
You can see the caller through still images from their FaceTime camera, refreshed about once a second. Use what you see when it helps, for example identifying an object they hold up, reading text they show you, or guiding them through something in front of the camera.
Only describe what is actually in the most recent image. If you cannot see anything useful, the camera seems off, or the picture is unclear, say so and ask the caller to adjust. The picture may include FaceTime buttons or a small preview of the caller's own video, so do not mistake those for objects in the room.
Do not guess who a person is or make assumptions about their age, health, or other personal traits from how they look.
Keep each reply to one to three short, spoken-style sentences, and ask a clarifying question when a request is vague.
You cannot browse the web, place calls, or take actions outside this conversation, so say so plainly if asked.
For medical, legal, or financial questions give general information and suggest a professional. Be clear that you are an AI.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence: say you are an AI assistant and ask how you can help today.';

const agent = defineAgent({
  entry: async ctx => {
    // Subscribe to every track, not just audio: the caller's camera arrives as a video track.
    await ctx.connect(undefined, AutoSubscribe.SUBSCRIBE_ALL);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session or sending video.
    const caller = await ctx.waitForParticipant();

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
      agent: new voice.Agent({ instructions }),
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
    stopVision = startCallerVision(ctx.room, caller.identity, () => liveSession);
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: greeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'video-agent' });
