"use strict";

globalThis.p2jbPreflightPromise = (async function () {
    const SYS_GETPID = 0x14n;
    const SYS_KQUEUEEX = 0x8Dn;
    const BAD_NAME_PTR = 0x800000000000n;

    async function writeLog(message) {
        if (typeof log === "function") await log(message);
    }

    try {
        await writeLog("[p2jb-preflight] iniciando");
        if (typeof syscall !== "function")
            throw new Error("syscall() nao disponivel");

        const pid = BigInt(syscall(SYS_GETPID));
        if (pid <= 0n || pid > 0x7FFFFFFFn)
            throw new Error("getpid retorno invalido: " + pid.toString());
        await writeLog("[p2jb-preflight] getpid=" + pid.toString());

        const result = BigInt(syscall(SYS_KQUEUEEX, BAD_NAME_PTR));
        const low32 = BigInt.asUintN(32, result);
        const classification = low32 === 14n ? "EFAULT"
            : low32 === 12n ? "ENOMEM"
            : low32 === 0n ? "SUCCESS-NOT-LEAK" : "UNEXPECTED";

        await writeLog(
            "[p2jb-preflight] kqueueex ret=" + result.toString()
            + " / 0x" + result.toString(16)
        );
        await writeLog("[p2jb-preflight] classificacao=" + classification);
        return {
            pid,
            kqueueexReturn: result,
            classification,
        };
    } catch (error) {
        await writeLog("[p2jb-preflight] exception: " + String(error));
        return undefined;
    } finally {
        await writeLog(
            "[p2jb-preflight] finalizado; nenhuma etapa posterior"
        );
    }
})();
