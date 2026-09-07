(function (global) {
    "use strict";

    function create(list, options) {
        const maxEntries = options && Number.isFinite(options.maxEntries)
            ? Math.max(1, Math.floor(options.maxEntries))
            : 100;

        function add(message, state) {
            const entry = list.ownerDocument.createElement("div");
            entry.className = `progress-entry ${state || "run"}`;
            entry.textContent = String(message);
            list.appendChild(entry);

            while (list.children.length > maxEntries)
                list.removeChild(list.firstChild);

            try { list.scrollTop = list.scrollHeight; } catch {}
        }

        function addMark(attempt, tag, extra) {
            let state = "run";
            if (/(?:FAIL|MISMATCH|ABORT|THREW|UNSUPPORTED|ERROR|NO-RESULT)/
                .test(tag))
                state = "bad";
            else if (/(?:PASS|SUCCESS|SENT)/.test(tag))
                state = "ok";

            const prefix = `[${String(attempt).padStart(3, "0")}] ${tag}`;
            add(prefix + (extra !== undefined ? ` — ${extra}` : ""), state);
        }

        return { add, addMark };
    }

    global.TestProgressLog = { create };
})(window);
