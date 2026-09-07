"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const logPath = path.join(__dirname, "..", "log.js");

function loadProgressLog() {
    assert.ok(fs.existsSync(logPath), "log.js deve existir");

    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(logPath, "utf8"), context, {
        filename: logPath,
    });
    return context.window.TestProgressLog;
}

function makeList() {
    const document = {
        createElement() {
            return { className: "", textContent: "" };
        },
    };

    return {
        children: [],
        ownerDocument: document,
        appendChild(child) {
            this.children.push(child);
        },
        removeChild(child) {
            assert.equal(child, this.children[0]);
            this.children.shift();
        },
        get firstChild() {
            return this.children[0] || null;
        },
        set textContent(value) {
            if (value === "") this.children.length = 0;
        },
    };
}

test("registra avanços em ordem com o estado informado", () => {
    const ProgressLog = loadProgressLog();
    const list = makeList();
    const log = ProgressLog.create(list, { maxEntries: 3 });

    log.add("BOOT", "run");
    log.add("BASE RESOLVIDA", "ok");

    assert.deepEqual(
        list.children.map(({ textContent, className }) => ({
            textContent,
            className,
        })),
        [
            { textContent: "BOOT", className: "progress-entry run" },
            { textContent: "BASE RESOLVIDA", className: "progress-entry ok" },
        ],
    );
});

test("mantém somente os avanços mais recentes dentro do limite", () => {
    const ProgressLog = loadProgressLog();
    const list = makeList();
    const log = ProgressLog.create(list, { maxEntries: 2 });

    log.add("etapa 1");
    log.add("etapa 2");
    log.add("etapa 3");

    assert.deepEqual(
        list.children.map(({ textContent }) => textContent),
        ["etapa 2", "etapa 3"],
    );
});

test("formata marcas de teste e destaca sucesso e falha", () => {
    const ProgressLog = loadProgressLog();
    const list = makeList();
    const log = ProgressLog.create(list);

    log.addMark(4, "WEBKIT-BASE", "0x1234");
    log.addMark(4, "MODULE-IMPORT-LEAK-PASS");
    log.addMark(4, "COMMIT-ABORT", "state-changed");

    assert.deepEqual(
        list.children.map(({ textContent, className }) => ({
            textContent,
            className,
        })),
        [
            {
                textContent: "[004] WEBKIT-BASE — 0x1234",
                className: "progress-entry run",
            },
            {
                textContent: "[004] MODULE-IMPORT-LEAK-PASS",
                className: "progress-entry ok",
            },
            {
                textContent: "[004] COMMIT-ABORT — state-changed",
                className: "progress-entry bad",
            },
        ],
    );
});
