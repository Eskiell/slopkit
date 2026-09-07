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
    return context.p2jbPreflightPromise;
}

test("valida getpid antes de chamar kqueueex uma vez", async () => {
    const calls = [];
    const logs = [];

    const result = await execute({
        syscall(number, ...args) {
            calls.push([number, ...args]);
            return number === 0x14n ? 321n : 14n;
        },
        async log(message) {
            logs.push(message);
        },
    });

    assert.deepEqual(calls, [
        [0x14n],
        [0x8Dn, 0x800000000000n],
    ]);
    assert.deepEqual({ ...result }, {
        pid: 321n,
        kqueueexReturn: 14n,
        classification: "EFAULT",
    });
    assert.deepEqual(logs, [
        "[p2jb-preflight] iniciando",
        "[p2jb-preflight] getpid=321",
        "[p2jb-preflight] kqueueex ret=14 / 0xe",
        "[p2jb-preflight] classificacao=EFAULT",
        "[p2jb-preflight] finalizado; nenhuma etapa posterior",
    ]);
});

test("não chama kqueueex quando getpid não é plausível", async () => {
    const calls = [];
    const logs = [];

    const result = await execute({
        syscall(number) {
            calls.push(number);
            return 0n;
        },
        async log(message) {
            logs.push(message);
        },
    });

    assert.deepEqual(calls, [0x14n]);
    assert.equal(result, undefined);
    assert.deepEqual(logs, [
        "[p2jb-preflight] iniciando",
        "[p2jb-preflight] exception: Error: getpid retorno invalido: 0",
        "[p2jb-preflight] finalizado; nenhuma etapa posterior",
    ]);
});
