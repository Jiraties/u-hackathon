declare module 'solc' {
  const solc: { version(): string; compile(input: string, callbacks?: { import(name: string): { contents?: string; error?: string } }): string };
  export default solc;
}
