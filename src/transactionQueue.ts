import type { DB, Transaction } from '@op-engineering/op-sqlite'

export interface PendingTransaction {
  readonly: boolean
  start: (tx: Transaction) => Promise<void>
  finish: () => void
}

export class TransactionQueue {
  queue: PendingTransaction[] = []
  inProgress = false
  db: DB

  constructor(db: DB) {
    this.db = db
  }

  run() {
    if (this.inProgress) {
      // Transaction is already in process bail out
      return
    }

    if (this.queue.length) {
      this.inProgress = true
      const tx = this.queue.shift()

      if (!tx) {
        throw new Error('Could not get a operation on database')
      }

      setImmediate(async () => {
        try {
          if (tx.readonly) {
            console.log('---> transaction start!')
            await tx.start({
              commit: () => ({ rowsAffected: 0 }),
              execute: this.db.execute.bind(this.db),
              executeAsync: this.db.executeAsync.bind(this.db),
              rollback: () => ({ rowsAffected: 0 }),
            })
          } else {
            console.log('---> write transaction start!')
            await this.db.transaction(tx.start)
          }
        } finally {
          console.log(
            '<--- transaction finished! queue.length:',
            this.queue.length
          )
          tx.finish()
          this.inProgress = false
          if (this.queue.length) this.run()
        }
      })
    } else {
      this.inProgress = false
    }
  }

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve) => {
      this.queue.push({ readonly: false, start: fn, finish: resolve })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve) => {
      this.queue.push({ readonly: true, start: fn, finish: resolve })
      this.run()
    })
  }
}
