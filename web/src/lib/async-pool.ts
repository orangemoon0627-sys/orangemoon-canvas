export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
    if (!items.length) return [];
    const results = new Array<R>(items.length);
    const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
    let nextIndex = 0;

    const runWorker = async () => {
        for (;;) {
            const index = nextIndex;
            if (index >= items.length) return;
            nextIndex += 1;
            results[index] = await worker(items[index]!, index);
        }
    };

    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
}

export function allSettledWithConcurrency<T>(tasks: ReadonlyArray<() => Promise<T>>, concurrency: number) {
    return mapWithConcurrency(tasks, concurrency, async (task): Promise<PromiseSettledResult<T>> => {
        try {
            return { status: "fulfilled", value: await task() };
        } catch (reason) {
            return { status: "rejected", reason };
        }
    });
}
