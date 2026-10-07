import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../src/lib/firebase";

export async function signInWithEmulatorUser(
  email: string,
  password: string,
): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}
