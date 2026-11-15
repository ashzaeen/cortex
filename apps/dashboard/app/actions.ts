"use server";
// Server actions for sign-in and sign-out, callable from client components.
import { authConfigured, signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  if (!authConfigured) return { error: "Google sign-in isn't set up on this deployment yet. Try the demo." };
  await signIn("google", { redirectTo: "/app" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
