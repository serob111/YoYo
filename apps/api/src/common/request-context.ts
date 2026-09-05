import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextStore {
  requestId: string;
  userId?: string;
  organizationId?: string;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  current(): RequestContextStore | undefined {
    return storage.getStore();
  },
  requireCurrent(): RequestContextStore {
    const store = storage.getStore();
    if (!store) {
      throw new Error("RequestContext accessed outside of a request lifecycle");
    }
    return store;
  },
  setOrganizationId(organizationId: string): void {
    const store = storage.getStore();
    if (store) {
      store.organizationId = organizationId;
    }
  }
};
