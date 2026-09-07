/* Sequential, single-run loader for the PS5 12.40 P2JB study modules. */
(function (global) {
    "use strict";

    const MODULES = Object.freeze([
        "p2jb/lk-12.40.js",
        "p2jb/rop-worker.js",
        "p2jb/slopkit-adapter.js",
        "p2jb/syscall.js",
    ]);

    function create(options) {
        options = options || {};
        const loadScript = options.loadScript;
        if (typeof loadScript !== "function")
            throw new Error("p2jb loader requires loadScript");
        const mark = typeof options.mark === "function"
            ? options.mark : function () {};
        const initialize = typeof options.initialize === "function"
            ? options.initialize
            : async function () {
                global.SlopKitP2JBAdapter.install(
                    global.SlopKitP2JBContext,
                    global.P2JBFirmware1240
                );
                return global.P2JBSyscall.initialize();
            };
        const getPreflight = typeof options.getPreflight === "function"
            ? options.getPreflight
            : function () { return global.p2jbPreflightPromise; };
        let running;

        function run() {
            if (running) return running;
            running = (async function () {
                for (const src of MODULES) {
                    mark("P2JB-MODULE-LOAD", src);
                    await loadScript(src);
                    mark("P2JB-MODULE-READY", src);
                }

                mark("P2JB-INITIALIZE", "start");
                await initialize();
                mark("P2JB-INITIALIZE", "ready");

                const preflightSrc = "p2jb_preflight.js";
                mark("P2JB-MODULE-LOAD", preflightSrc);
                await loadScript(preflightSrc);
                mark("P2JB-MODULE-READY", preflightSrc);
                await Promise.resolve(getPreflight());
                mark("P2JB-PREFLIGHT-COMPLETE",
                    "execution-stopped-after-preflight");
            })();
            return running;
        }

        return Object.freeze({ run });
    }

    global.P2JBLoader = Object.freeze({ create, modules: MODULES });
})(window);
