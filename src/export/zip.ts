export async function makeZip(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const { zip } = await import("fflate");
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const file of files) entries[file.name] = [file.data, { level: 0 }];
  return new Promise((resolve, reject) => {
    zip(entries, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

export function manifestText(
  lines: { file: string; placements: string[]; notes: string[] }[],
): string {
  const chunks = [
    "fit-every-feed",
    "One file per size. Placements that share a size share the file.",
    "",
  ];
  for (const line of lines) {
    chunks.push(line.file);
    for (const p of line.placements) chunks.push(`  - ${p}`);
    for (const n of line.notes) chunks.push(`  ! ${n}`);
    chunks.push("");
  }
  return chunks.join("\n");
}
