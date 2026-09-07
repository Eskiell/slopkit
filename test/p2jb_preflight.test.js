"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "p2jb_preflight.js");

async function execute(context) {
    assert.ok(fs.existsSync(scriptPath), "p2jb_preflight.js deve existir");
    vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, {
        filename: scriptPath,
    });
    await new Promise((resolve) => setImmediate(resolve));
}

test("executa kqueueex uma vez e registra o caminho EFAULT", async () => {
    const calls = [];
    const logs = [];

    await execute({
        syscall(...args) {
            calls.push(args);
            return 14n;
        },
        async log(message) {
            logs.push(message);
        },
    });

    assert.deepEqual(calls, [[0x8Dn, 0x800000000000n, 0n]]);
    assert.deepEqual(logs, [
        "[kqueueex-poc] iniciando chamada unica",
        "[kqueueex-poc] ret=14 / 0xe",
        "[kqueueex-poc] EFAULT -> leak path atingido",
        "[kqueueex-poc] finalizado",
    ]);
});

test("registra a pré-condição ausente sem tentar a syscall", async () => {
    const logs = [];

    await execute({
        async log(message) {
            logs.push(message);
        },
    });

    assert.deepEqual(logs, [
        "[kqueueex-poc] iniciando chamada unica",
        "[kqueueex-poc] exception: Error: syscall() nao disponivel",
        "[kqueueex-poc] finalizado",
    ]);
});
