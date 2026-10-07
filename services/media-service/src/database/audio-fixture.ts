import { createHash } from "node:crypto";

// Six seconds of quiet mono PCM, 16-bit little-endian, 8 kHz.
export function demoAudio(index: number): Buffer {
  if (![1, 2, 3].includes(index)) throw new Error("Unknown demo");
  const samples = 8000 * 6;
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(samples * 2, 40);
  const frequency = [220, 330, 440][index - 1]!;
  for (let sample = 0; sample < samples; sample++) {
    bytes.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * frequency * sample / 8000)), 44 + sample * 2);
  }
  return bytes;
}

export const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
