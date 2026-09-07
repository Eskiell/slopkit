# Regras do projeto

## Objetivo

Validar na prática o funcionamento do bug de kernel P2JB atribuído a Gezine,
em um PS5 real com firmware 12.40.

O objetivo atual é estudo e diagnóstico. Não é executar um jailbreak completo,
carregar payloads ou acrescentar funcionalidades não solicitadas.

## Fonte técnica obrigatória

O repositório abaixo é a referência principal para o P2JB:

- <https://github.com/soniciso1/P2JB>

Antes de portar qualquer comportamento, é obrigatório ler o fluxo relevante
completo na referência, incluindo suas dependências. Não deduzir uma
implementação apenas por nomes, offsets ou trechos isolados.

Não inventar APIs, bridges, abstrações ou substitutos e apresentá-los como parte
do P2JB original. Toda adaptação indispensável ao SlopKit deve:

1. ficar fora do código principal do experimento;
2. ter seu motivo documentado;
3. indicar claramente que é uma adaptação local;
4. preservar a semântica observada na referência.

## Responsabilidade do WebKit

O WebKit é somente o ponto de entrada. Sua responsabilidade termina depois de:

1. explorar a vulnerabilidade WebKit;
2. obter as primitivas necessárias de memória;
3. resolver as bases exigidas;
4. entregar essas capacidades ao código do P2JB.

O código WebKit não deve conter lógica específica do bug de kernel P2JB.

## `p2jb_preflight.js`

Esse arquivo deve conter somente o código mínimo necessário para validar o
caminho do P2JB estudado.

- Manter o fluxo legível e próximo da referência.
- Não colocar interface, criação de elementos HTML ou estilos nesse arquivo.
- Não colocar formatadores, coletores de logs ou outras funções auxiliares.
- Não incluir notification exploit, payload loader ou etapas posteriores.
- Não incluir loops de burn, corrida ou repetição automática sem solicitação
  explícita.

Logs, interface e funções auxiliares devem permanecer em arquivos separados.

## Validação inicial de `kqueueex`

Para o preflight estudado, usar os valores documentados pela referência:

- syscall: `SYS_KQUEUEEX = 0x08D`;
- argumento PoC: `0x800000000000`;
- firmware alvo: PS5 12.40.

A implementação deve usar o mecanismo real de syscall e ROP da referência, ou
um porte comprovadamente equivalente conectado às primitivas reais do SlopKit.
Não substituir esse caminho por mocks ou simulações.

## Logs

O painel visual deve permitir acompanhar, no mínimo:

- carregamento do preflight;
- disponibilidade das primitivas;
- bases resolvidas;
- início da chamada;
- retorno bruto;
- erro ou exceção;
- ponto exato em que a execução parou.

O painel e sua formatação devem ficar fora de `p2jb_preflight.js`. Os logs não
devem iniciar chamadas, retries ou mudar o estado do experimento.

## Segurança operacional do teste

- Executar uma única chamada no preflight, salvo instrução explícita diferente.
- Não criar retries automáticos que acumulem memória.
- Não iniciar o burn de referências durante o preflight.
- Não executar notification exploit.
- Não carregar payloads.
- Parar imediatamente quando uma pré-condição não estiver comprovada.
- Registrar o motivo da interrupção no painel.

## Critério de conclusão

Testes locais validam somente estrutura, sintaxe e comportamento isolado. Eles
não comprovam que o bug de kernel funcionou.

Só declarar a validação prática concluída depois de observar no PS5 real o
caminho esperado e registrar o retorno produzido pela chamada real. Distinguir
sempre:

- código escrito;
- teste local;
- código carregado no PS5;
- função executada no PS5;
- resultado confirmado no hardware.

## Forma de trabalho

- Permanecer estritamente no escopo solicitado.
- Não reativar código antigo como efeito colateral.
- Não misturar experimentos diferentes na mesma alteração.
- Verificar o diff antes de concluir.
- Informar com precisão o que foi implementado e o que ainda não foi validado.
- Não solicitar novamente autorização para ações já abrangidas pelo pedido do
  usuário; pedir intervenção apenas quando existir um bloqueio técnico que exija
  informação nova.
