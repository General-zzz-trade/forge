type Callback = (error: Error | null) => void

export default function treeKill(
  pid: number,
  signal: NodeJS.Signals | number = 'SIGTERM',
  callback?: Callback,
): void {
  try {
    process.kill(pid, signal)
    callback?.(null)
  } catch (error) {
    callback?.(error instanceof Error ? error : new Error(String(error)))
  }
}
