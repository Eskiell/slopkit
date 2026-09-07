# Infraestrutura genérica de syscall do P2JB no SlopKit

## Objetivo

Portar para o SlopKit a infraestrutura genérica de syscall usada pelo P2JB,
preservando o fluxo da referência e limitando o primeiro uso a duas chamadas no
PS5 12.40:

1. `getpid()` para validar o executor;
2. uma única `kqueueex(0x800000000000)` para observar o retorno do preflight.

O porte é destinado a estudo e diagnóstico. Ele não executará burn de
referências, corrida do kernel, notification exploit, jailbreak ou payloads.

## Referência e proveniência

A referência principal é `soniciso1/P2JB` no branch `main`, em especial:

- `rop-worker.js`: montagem e execução das cadeias em um Worker;
- `rop_slave.js`: Worker estacionado;
- `p2jb_lk.js`: offsets de `libkernel_web` por firmware;
- `p2jb_poops.js`: adaptação das primitivas e publicação de `window.syscall`;
- `p2jb.js`: consumidor da API e probe de `kqueueex`.

Arquivos copiados devem manter cabeçalho de proveniência, URL e revisão de
origem. Alterações locais devem ser marcadas como adaptações do SlopKit.

## Escopo

### Incluído

- Executor ROP genérico em Worker.
- API global síncrona `syscall(number, ...args)` com até seis argumentos.
- Conversão consistente para `BigInt`.
- Captura do retorno bruto de `rax`.
- Perfil estrito para firmware 12.40.
- Validação de `getpid()` antes de `kqueueex`.
- Logs das pré-condições, bases, inicialização, chamadas, retornos e ponto de
  interrupção.

### Excluído

- Infraestrutura completa do exploit POOPS.
- `p2jb.js` completo e suas etapas de kernel.
- Syscalls em lote usadas por spray ou corrida.
- Threads de leak, loops de burn e repetição automática.
- Notification exploit e envio de payloads.
- Suporte presumido a outros firmwares.

## Componentes

### `p2jb/rop-worker.js`

Derivação rastreável do executor da referência. Responsabilidades:

- localizar e validar a stack do Worker estacionado;
- montar cadeias ROP;
- executar uma cadeia por vez;
- armazenar o retorno antes de publicar o marcador de conclusão;
- restaurar o frame original por `longjmp`;
- recusar novas chamadas depois de timeout ou corrupção detectada.

Somente as APIs necessárias a chamadas individuais serão expostas. Helpers de
batch, spray e corrida não serão portados nesta fase.

### `p2jb/rop-slave.js`

Worker mínimo correspondente ao `rop_slave.js` da referência. Ele será criado
uma única vez e mantido vivo durante o preflight.

### `p2jb/lk-12.40.js`

Perfil imutável de firmware contendo apenas offsets comprovados pela referência:

- `syscall_wrapper = 0x1AE47`;
- `setjmp = 0x1D3D3`;
- `longjmp = 0x1D42C`;
- `pthread_create = 0x79B0`;
- `slot_expect = 0x1981B`;
- `thread_list = 0x68218`;
- `pthread_next = 0x38`;
- `pthread_stack = 0xA8`;
- `pthread_stacksz = 0xB0`.

Os gadgets do WebKit 12.40 serão derivados da base resolvida usando o perfil
`offsets/12.40.js` da referência. Nenhum offset de outro firmware será usado
como fallback.

### `p2jb/slopkit-adapter.js`

Camada local entre o `notify.html` e o executor. Responsabilidades:

- publicar leitura e escrita de 8, 16, 32 e 64 bits;
- manter vivas as estruturas que sustentam a primitiva;
- fornecer uma região scratch persistente e alinhada;
- fornecer bases e gadgets absolutos validados;
- expor o Worker e sua stack somente depois de comprovados;
- falhar antes da primeira syscall quando alguma capacidade não existir.

Esta camada não implementará mocks, valores de retorno artificiais ou caminhos
alternativos apresentados como parte do P2JB.

### `p2jb/syscall.js`

Inicializa o executor e publica `window.syscall`. Para cada chamada:

1. converte número e argumentos para `BigInt`;
2. coloca os argumentos em `rdi`, `rsi`, `rdx`, `rcx`, `r8` e `r9`;
3. coloca o número em `rax`;
4. chama `libkernelBase + syscall_wrapper`;
5. grava `rax` no slot de retorno;
6. aguarda o marcador de conclusão com limite;
7. restaura a stack e retorna o valor bruto.

### `p2jb_preflight.js`

Consumidor mínimo da API. Executa sequencialmente:

1. valida `window.syscall`;
2. chama `getpid` (`0x14`) e exige um PID inteiro plausível;
3. chama `kqueueex` (`0x08D`) uma única vez com
   `0x800000000000`;
4. classifica `14` como EFAULT, `12` como ENOMEM, `0` como sucesso fora do
   leak path e outros valores como inesperados;
5. registra o ponto final e não inicia nenhuma etapa posterior.

## Integração no `notify.html`

O carregamento ocorre somente depois de o fluxo WebKit comprovar suas
primitivas e bases. A ordem será:

1. `p2jb/lk-12.40.js`;
2. `p2jb/rop-worker.js`;
3. `p2jb/slopkit-adapter.js`;
4. `p2jb/syscall.js`;
5. `p2jb_preflight.js`.

Cada script será aguardado antes do seguinte. Falha de rede, sintaxe,
inicialização ou validação encerra o experimento sem retry. O caminho que hoje
chamaria `commitNotificationProof()` permanecerá desativado nesse modo.

## Pré-condições e interrupção segura

Antes de `getpid`, o adaptador deve comprovar:

- firmware detectado exatamente como 12.40;
- bases WebKit e libkernel canônicas e alinhadas;
- leitura repetida e estável de uma região própria;
- escrita seguida de leitura e restauração na região própria;
- existência e faixa válida de cada gadget;
- scratch suficiente e alinhado;
- Worker vivo;
- stack do Worker identificada sem ambiguidade;
- slot estacionado contendo o retorno esperado.

Qualquer falha gera um log `P2JB-PREFLIGHT-ABORT` com a condição e encerra a
execução. O executor nunca continua depois de timeout, frame inesperado ou
falha de restauração.

## Limitação conhecida do SlopKit atual

O `notify.html` mantém uma janela de leitura e escrita por meio de um carrier,
mas ainda não oferece a API genérica, o alocador persistente ou a descoberta de
stack exigidos pelo executor. A primeira etapa da implementação será um gate de
capacidade. Se a primitiva atual não puder ser preservada de forma estável e
equivalente, o porte para nesse gate e registra a lacuna; ele não substitui a
capacidade ausente por simulação.

## Logs

Os componentes emitem eventos para a infraestrutura visual existente, sem
iniciar chamadas ou retries. Eventos mínimos:

- carregamento de cada módulo;
- firmware e bases;
- validação de leitura/escrita;
- Worker e stack;
- validação do slot;
- início e retorno de `getpid`;
- início e retorno bruto de `kqueueex`;
- exceção ou pré-condição ausente;
- ponto exato de parada.

## Testes

### Locais

- Conversão e ordenação de até seis argumentos.
- Layout da cadeia ROP com fixtures literais de endereços.
- Cálculo dos endereços absolutos do perfil 12.40.
- Rejeição de firmware, bases, gadgets e slots inválidos.
- Uma chamada de `getpid` seguida de exatamente uma `kqueueex`.
- Classificação dos retornos EFAULT, ENOMEM, zero e inesperado.
- Timeout e latch que impede chamadas posteriores.
- Sintaxe de todos os scripts e ordem de carregamento.

Os testes locais não executarão código nativo nem afirmarão validação do bug.

### Hardware

No PS5 12.40, registrar separadamente:

1. código carregado;
2. primitiva preservada;
3. Worker inicializado;
4. `getpid` executado e retorno observado;
5. `kqueueex` executado e retorno observado.

Somente o quinto item confirma o resultado prático do preflight no hardware.
