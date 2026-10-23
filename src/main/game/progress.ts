import type { Task } from '@xmcl/task'
import type { InstallProgress } from '@shared/types'

export type ProgressSink = (p: InstallProgress | null) => void

/**
 * Выполняет задачи установки xmcl и раз в 200 мс шлёт в окно прогресс:
 * сколько файлов уже скачано и сколько байт пришло.
 */
export class InstallRunner {
  private stageIndex = 0

  constructor(
    private readonly instanceId: string,
    private readonly stageCount: number,
    private readonly sink: ProgressSink
  ) {}

  /** Этап со своим подсчётом прогресса (например, загрузка модов) */
  async custom<T>(
    stage: string,
    body: (update: (bytes: number, totalBytes: number, files: number) => void) => Promise<T>
  ): Promise<T> {
    this.stageIndex++
    const update = (bytes: number, totalBytes: number, files: number): void =>
      this.sink({
        instanceId: this.instanceId,
        stage,
        stageIndex: this.stageIndex,
        stageCount: this.stageCount,
        files,
        bytes,
        totalBytes
      })
    update(0, 0, 0)
    return body(update)
  }

  /** retry: повтор того же этапа, номер этапа не увеличиваем */
  async run<T>(stage: string, task: Task<T>, retry = false): Promise<T> {
    if (!retry) this.stageIndex++
    let files = 0
    const emit = (): void =>
      this.sink({
        instanceId: this.instanceId,
        stage,
        stageIndex: this.stageIndex,
        stageCount: this.stageCount,
        files,
        bytes: task.progress,
        totalBytes: task.total
      })
    emit()
    const timer = setInterval(emit, 200)
    try {
      return await task.startAndWait({
        onSucceed: (t) => {
          if (t !== task) files++
        }
      })
    } finally {
      clearInterval(timer)
      emit()
    }
  }
}
