export class JobGuard {
    active;
    handle;
    tryStart(id) { if (this.active)
        return false; this.active = id; return true; }
    attachRunJob(id, handle) { if (this.active !== id)
        throw new Error(`cannot attach runJob ${handle} to inactive job ${id}`); this.handle = handle; }
    clearRunJob(id) { if (this.active === id)
        this.handle = undefined; }
    finish(id) { if (this.active === id) {
        this.active = undefined;
        this.handle = undefined;
    } }
    forceFinish() { this.active = undefined; this.handle = undefined; }
    get activeJob() { return this.active; }
    get runJobHandle() { return this.handle; }
}
