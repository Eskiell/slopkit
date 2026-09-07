/*
 * Controlled syscall publication for SlopKit's PS5 12.40 P2JB study path.
 * The global entry point is installed only after every memory/Worker gate.
 */
(function (global) {
    "use strict";

    let initialization;
    let activeExecutor;

    function mark(tag, detail) {
        const memory = global.SlopKitP2JB;
        const fn = memory && memory.context && memory.context.mark;
        if (typeof fn === "function") fn(tag, detail);
    }

    function initialize() {
        if (initialization) return initialization;

        initialization = (async function () {
            const memory = global.SlopKitP2JB;
            const profile = global.P2JBFirmware1240;
            const factory = global.P2JBRopWorker;
            if (!memory || !profile || !factory)
                throw new Error("p2jb syscall dependencies unavailable");
            if (memory.firmware !== "12.40" || profile.firmware !== "12.40")
                throw new Error("firmware 12.40 required");

            mark("P2JB-SYSCALL-START", "firmware=12.40");
            memory.validate();
            mark("P2JB-SYSCALL-MEMORY", "validated=true");

            const worker = new Worker("p2jb/rop-slave.js");
            const executor = factory.create(memory, profile, worker);
            await executor.initialize();

            const syscall = function (number, ...args) {
                const values = args.map(function (value) { return BigInt(value); });
                return executor.syscallSync(BigInt(number), ...values).retval;
            };
            activeExecutor = executor;
            global.syscall = syscall;
            mark("P2JB-SYSCALL-READY", "published=true");
            return executor;
        })();

        return initialization;
    }

    global.P2JBSyscall = Object.freeze({
        initialize,
        get executor() { return activeExecutor; },
    });
})(window);
