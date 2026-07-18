import { workerRouter } from '../app/worker-router.ts'

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await workerRouter.fetch(request)
    } catch (error) {
      if (!(request.signal.aborted && error === request.signal.reason)) {
        console.error(
          JSON.stringify({
            message: 'Unhandled Site by Site request error',
            error: error instanceof Error ? error.message : String(error),
            path: new URL(request.url).pathname,
          }),
        )
      }

      return new Response('Internal Server Error', { status: 500 })
    }
  },
}
