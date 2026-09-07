# P2JB preflight — PS5 12.40

Este roteiro executa somente a validação `getpid` → `kqueueex`. Ele não
executa notification exploit, jailbreak, payload, burn ou retry automático.

## Execução no hardware

1. Confirme que o PS5 e o Mac estão na mesma rede. Nesta sessão, o IPv4 do
   Mac na interface ativa `en1` é `192.168.15.152`.
2. Na raiz do projeto, inicie o host:

   ```bash
   sudo python3 host-local.py --ip 192.168.15.152 --no-update-check --verbose
   ```

3. Configure o DNS primário do PS5 como `192.168.15.152`.
4. Abra o Guia do Usuário no PS5 e selecione `RUN` uma única vez.
5. Registre as últimas linhas visíveis relativas a:

   - `P2JB-CARRIER-PASS` e scratch;
   - bases WebKit e libkernel;
   - Worker, stack e slot estacionado;
   - `[p2jb-preflight] getpid=...`;
   - retorno bruto e classificação de `kqueueex`.

6. Pare depois de `[p2jb-preflight] finalizado; nenhuma etapa posterior`.
   Não recarregue automaticamente para repetir o teste.

## Critério de evidência

Um resultado no hardware exige um PID real e plausível seguido pelo retorno
bruto da única chamada real a `kqueueex(0x800000000000)`. As classificações
mostradas são `EFAULT`, `ENOMEM`, `SUCCESS-NOT-LEAK` ou `UNEXPECTED`.

Os testes locais verificam estrutura, ordem, sintaxe e hospedagem dos arquivos;
eles não confirmam que o caminho de kernel funcionou no PS5.

## Verificação local reproduzível

```bash
node --test
python3 test/test_host_local.py
for file in log.js p2jb_preflight.js p2jb/*.js; do node --check "$file"; done
```

Para testar apenas o conteúdo servido, sem DNS e sem HTTPS, use uma porta HTTP
alta e acesse `http://127.0.0.1:18777/notify.html`:

```bash
python3 host-local.py --ip 127.0.0.1 --no-dns --no-https \
  --http-port 18777 --no-update-check --verbose
```
