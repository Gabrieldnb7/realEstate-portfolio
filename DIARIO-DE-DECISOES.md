# Diário de Decisões

O projeto roda **sem criar `.env`**. O `npm ci`
não precisa de compilador C++ porque o `.npmrc` traz `ignore-scripts=true` e o better-sqlite3 já vem
com os binários prontos da plataforma; sem `SEGREDO_APP` o servidor entra em modo de desenvolvimento
com um segredo efêmero (aviso no console, sessões caem a cada reinício); sem `ADMIN_SENHA` o
`npm run semear:teste` sorteia uma senha e imprime uma única vez. O `npm start` já roda o build antes
de subir, então `dist/` não precisa existir no clone.

## Premissas que assumi

| # | Onde o enunciado ou as regras não diziam | O que assumi | Por quê |
|---|---|---|---|
| 1 | A planilha de exemplo tem o apartamento **PA-0204** sem `andar`, e andar é obrigatório para apartamento no Anexo C, seção 3. O enunciado não diz se o `semear` deve rejeitar o arquivo, corrigir o registro ou importar como está. | Importei o registro como está — `andar` nulo e situação `rascunho` — e deixei a regra ser cobrada na escrita, não na importação. | Rascunho é o único estado que admite cadastro incompleto. Ao publicar, `validarRegrasTipologia()` volta `422 { erro: 'dados_invalidos', campos: [{ campo: 'andar', codigo: 'obrigatorio_inteiro' }] }`. Descartar a planilha inteira por uma linha, ou inventar um andar sintético, mentiria sobre o insumo do desk. Risco aceito: quem tentar publicar esse imóvel sem corrigir é barrado — e é exatamente isso que eu quero que aconteça. |
| 2 | Como nasce o primeiro administrador, e se existe cadastro de usuário ou papéis. | Um administrador só, criado pelo seed com `ADMIN_EMAIL`; sem tela de cadastro, sem papéis, sem "esqueci a senha". | O painel é de um desk interno e nenhum requisito pede multiusuário. Sem senha padrão versionada: sem `ADMIN_SENHA` o seed sorteia. Perco o caso "recuperei o acesso" e ganho o caso "nenhuma credencial no repositório". |
| 3 | Como a foto de capa é marcada. | A capa é a imagem de menor `ordem`; não existe coluna booleana `capa`. | Evita estado incoerente (duas capas, capa apontando para imagem apagada). Reordenar vira reescrever `ordem`, e o getter `capa` nunca discorda da lista. |
| 4 | Se o preço deve ser normalizado/convertido entre moedas. | Guardo valor e moeda como chegam (`PrecoVo`), sem taxa de câmbio. | Câmbio exige uma fonte de verdade externa que eu não poderia manter válida; o preço por m² da ficha sai na moeda da praça, que é o que o Anexo C mostra. |
| 5 | Valor desconhecido num filtro da query string deve dar erro ou ser ignorado. | Ignoro o valor inválido, aplico os demais e aquele eixo volta para "todos". | Página pública navegável vence; responder 400 para um link digitado à mão é hostil. O mesmo vale para os filtros do painel. |
| 6 | Onde o rate limit deve contar. | Só no login, 10 tentativas por minuto por IP, sem teto global. | Força bruta é o único ataque realista aqui. Um teto global puniria navegação normal e a própria suíte de testes com `app.inject`. |
| 7 | Como um erro deve sair fora do vocabulário do Anexo D. | Sempre `{ erro: <codigo> }` na API; no painel SSR a mesma falha volta como página com a mensagem do campo. | Um vocabulário para a máquina e outro para o humano, mas a mesma regra validada no servidor. |

## Decisões

| # | Decisão | Alternativas que considerei | Por que descartei | Risco que aceitei |
|---|---|---|---|---|
| 1 | Ficar na stack de referência (Node + Fastify + SQLite + TypeScript). | Django, Node + Express, Go. | Django me daria admin e auth prontos, que é justamente o que está sendo avaliado (e Django admin está na coluna "Proibido" da seção 5.1). Com Express eu teria a mesma curva e montaria multipart, cookie assinado e template à mão de qualquer forma. Em Go escreveria mais infraestrutura (templates, migrations, HTTP) sem tirar nenhum fluxo do meu colo. | Curva de aprendizado no começo: reescrevi o repositório de imóveis e a camada de sessão mais de uma vez, e os primeiros commits renderam pouco. Mitiguei travando o comportamento com testes antes de cada reescrita. |
| 2 | Renderização no servidor com POST/Redirect/GET e **zero JavaScript** no navegador. | SPA consumindo a API própria; Next/Astro como o enunciado tolera. | O framework isomórfico só faria sentido se eu fosse usar a auth e o painel que ele traz — vetado. Sem JS no navegador, todo o fluxo do painel é testável com `app.inject`, sem browser. | Repito a leitura de formulário entre a API JSON e o painel SSR. Mantive os dois chamando o mesmo serviço, então a regra do catálogo existe uma vez só. |
| 3 | Sessão com token aleatório gravado na tabela `sessoes` + cookie assinado. | JWT stateless no cookie; `express-session` com MemoryStore. | `express-session` e afins são o "fluxo pronto" que a seção 5.1 veta; JWT não resolve revogação — logout teria que manter uma lista de bloqueio, ou seja, uma tabela de sessão de novo. | Preciso expurgar a tabela (faço isso no ato do login) e cada requisição bate no SQLite para resolver a sessão. |
| 4 | Argon2id com parâmetros nomeados + hash reserva quando o e-mail não existe. | bcrypt; `verify` só no usuário encontrado. | Argon2id é o que o enunciado cita como permitido e é caro para GPU. Sem o hash reserva, "e-mail não cadastrado" responderia visivelmente mais rápido que "senha errada" e viraria oracle de enumeração. | Custo de CPU por tentativa (~19 MB, 2 passes). É por isso que o login tem teto de tentativas. |
| 5 | SQL puro com `prepare`/`run` parametrizado e migrações numeradas em `migracoes/`. | Prisma ou Drizzle. | ORM com `db push` / `synchronize: true` está na coluna Proibido, e eu precisava poder mostrar na defesa o SQL gerado da listagem filtrada. | Escrevo `JOIN`, `COUNT` e ordenação à mão; o erro que eu mais temia (contagem dos filtros errada) virou teste. |
| 6 | Upload conferido por magic numbers, nome regenerado em UUID e servido por rota própria com o `Content-Type` do formato detectado. | `@fastify/static`; confiar na extensão ou no `Content-Type` que o cliente envia. | Servir `UPLOAD_DIR` como estático exporia qualquer arquivo por nome e aceitaria HTML disfarçado de imagem. O cliente mente sobre o tipo do corpo, então a única prova é o conteúdo. | Sem `sharp` eu não reprocesso a imagem: o EXIF/metadata do arquivo enviado continua no disco. Corte assumido, registrado abaixo. |
| 7 | Exclusão direta do imóvel, sem tela de confirmação. | Modal "tem certeza?"; lixeira com desfazer. | Painel de um desk interno, um operador. O atrito de confirmar toda linha não paga o risco que está sendo evitado. | Não há desfazer: `ON DELETE CASCADE` derruba as linhas das imagens e os arquivos somem do disco. É a decisão mais cara deste diário e a que eu defenderia primeiro. |
| 8 | CSS próprio orientado aos tokens do Anexo B, sem framework de UI e sem biblioteca de animação. | Tailwind configurado com os tokens; uma lib de animação pequena. | Tailwind é "tolerado com condição" e eu teria que justificar na defesa um ganho de que não precisei; animação e identidade são parte avaliada. | Escrevi todo o CSS à mão (site e painel) e a coerência entre os dois virou risco de divergência — resolvido compartilhando `tokens.css`. |
| 9 | `npm ci` com `ignore-scripts=true` e os binários nativos do rolldown/Vitest declarados como `optionalDependencies` das cinco plataformas. | Deixar o npm compilar o better-sqlite3; confiar no lock gerado na minha máquina. | Sem toolchain C++ o `npm ci` falha; e o lock gerado no Windows registrava só o binário win32, o que quebraria `npm test` em Linux/macOS. Descobri isso rodando os cinco comandos do `banca.json` numa pasta vazia, na última tarefa. | `ignore-scripts` desliga também os ciclos de vida, então o build teve que sair do `prestart` e entrar no `start`. E se uma dependência futura precisar de postinstall, vou descobrir no teste, não no install. |

## Herança e composição (R-10)

| Parte do domínio | Usei herança, composição ou outra forma | Por quê |
|---|---|---|
| `Imovel` (abstrata) → `Apartamento`, `Villa` | **herança** | A base guarda e valida o que toda tipologia tem (`ref`, praça, preço, quartos, situação, imagens, slug). O único ponto de variação real são os dois métodos abstratos: `calcularPrecoPorM2()` e `validarRegrasTipologia()`. |
| `Penthouse` herda de `Apartamento`; `Estate` herda de `Villa` | **herança em dois níveis** | Penthouse é apartamento com andar alto: mesma área base (privativa) e mesmas regras. Villa e Estate compartilham área construída + terreno. Separá-las em quatro classes irmãs duplicaria a fórmula que o Anexo C, seção 3, já define igual para cada par. |
| `Imagem` (0..12, campo `ordem`) | **composição** | É parte do imóvel, mas tem vida própria: linha na tabela `imagens`, entra e sai depois do cadastro, cai por `ON DELETE CASCADE`. O limite de 12 e a renumeração moram na classe dona. |
| `PrecoVo` (valor decimal + moeda da praça) | **objeto de valor / composição** | "R$ 4.850.000,10" não é um float solto: valor e moeda são validados juntos e contra a praça. Não faz sentido herdar de um valor. |
| `SituacaoImovel` e suas transições | **outra forma**: union type + função `validarTransicaoSituacao()` | Cinco estados e uma matriz de transições; uma classe por estado não teria estado próprio nem comportamento além de "deixo ir para X?". |
| Escolha da classe pela tipologia | **outra forma**: fábrica `criarImovel({ tipologia, ... })` | Rota, serviço, painel e seed pedem um imóvel e recebem a classe certa. Sem `switch` copiado em quatro lugares. |
| Violação de regra de catálogo | **outra forma**: um único `DominioInvalidoError` carregando a lista de campos | Uma hierarquia de exceções por regra não acrescenta informação: quem responde a requisição precisa dos `campos`, não do tipo do erro. |
| Repositórios, serviços e rotas | **funções por módulo, sem herança e sem DI** | Não há estado a compartilhar entre eles; herança aqui seria cerimônia. As camadas se separam por importação (`entities` → `repositories` → `modules` → `routes`). |


## Stack e bibliotecas

| Biblioteca ou recurso | O que faz por mim | Como verifiquei |
|---|---|---|
| TypeScript 7 estrito (`verbatimModuleSyntax`, `nodenext`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) + ESM | tipo em todo o domínio e nas fronteiras HTTP; `undefined` não passa despercebido | `npx tsc --noEmit` limpo; o `noUncheckedIndexedAccess` me obrigou a tratar linha de CSV e linha de banco como opcionais |
| Fastify 5 | servidor, roteamento, logger, `setErrorHandler` e `setNotFoundHandler` | 162 testes com `app.inject`; servidor de pé conferido com `curl` |
| Parser próprio de `application/x-www-form-urlencoded` | o painel manda formulário, não JSON | teste de cadastro/edição pelo painel passando campo a campo |
| `@fastify/view` + Eta | templates SSR, com escape automático em `<%= %>` | `tests/catalogo.test.ts:421` grava um título com `<script>alert(1)</script>` e afirma que a página devolve `&lt;script&gt;` |
| `@fastify/cookie` | cookie `sessao_id` `HttpOnly`, `SameSite=Lax`, assinado com `SEGREDO_APP` | `tests/autenticacao.test.ts:103` confere o `Set-Cookie`; teste de token adulterado volta para o login |
| `@fastify/multipart` | upload com teto de 5 MB e 1 arquivo, `fieldSize` limitado | `tests/fotos-upload.test.ts` com JPG de 5 MB + 1 KB, tipo falso e extensão mentirosa |
| `@fastify/rate-limit` | 10 tentativas de login por minuto por IP | `tests/autenticacao.test.ts:247` espera 429 a partir da 11ª |
| `@fastify/cors` | API JSON consumível de fora | chamadas no Postman |
| better-sqlite3 em WAL | driver do banco, `prepare`/`run` parametrizado, FK com `ON DELETE CASCADE` | migrações + seed rodando em arquivo temporário por teste; nada de banco compartilhado com a suíte |
| `@node-rs/argon2` | primitiva de hash (não de fluxo de auth) | login correto/incorreto testado e hash reserva igualando o tempo dos dois caminhos |
| `tsx` | TypeScript em desenvolvimento e nos scripts de migrar/semear/copiar views | `npm run dev`, `npm run migrar`, `npm run semear:teste` |
| Vitest | suíte de domínio e de rota | `npm test` |
| `@rolldown/binding-*` + `.npmrc` (`ignore-scripts=true`) | dar ao Vitest o binário nativo da plataforma sem que o `npm ci` compile nada | clone dos arquivos versionados numa pasta vazia, `npm ci` → `migrar` → `semear:teste` → `start` → `GET /saude` 200 → `npm test` |

Não troquei a stack de referência: é Node + Fastify + SQLite + TypeScript, o trio sugerido pelo enunciado.

Nenhuma peça da coluna "Proibido" da seção 5.1 foi usada. 

## Segurança: limitações que conheço

- **Rate limit em memória do processo**: reiniciar zera a janela e um cluster de vários workers não
  divide os contadores (cada processo tem o seu teto de 10). Um store em SQLite/Redis resolveria; foi
  o corte mais consciente.
- **Sessão na tabela `sessoes`, mas o expurgo é preguiçoso**: as linhas vencidas são apagadas quando
  alguém faz login. Sem tráfego, a tabela cresce; não há agendamento.
- **Sem token CSRF**: a defesa é `SameSite=Lax` no cookie de sessão mais o fato de toda mutação ser
  POST (inclusive a exclusão do painel, que é um `<form method="post">` justamente por isso). Um
  navegador que envie o cookie em outro contexto não manda POST cross-site — mas não há segunda camada.
- **CORS `origin: '*'`** na API: deliberado para a API ser consumida de fora (Postman/avaliação). Com
  cookie HttpOnly e `*` o navegador não leva credencial, mas num deploy público a origin deveria ser
  fixa.
- **Nenhum hardening de cabeçalho**: sem CSP, sem `X-Content-Type-Options` global, sem helmet-like. O
  site é SSR sem script de terceiro e tudo escapa no template, mas um deploy deveria adicionar CSP.
- **`trust proxy` não configurado**: atrás de um proxy/CDN, o IP que o rate limit enxerga é o do proxy,
  o que na prática libera força bruta pela frente errada.
- **HTTPS é da hospedagem.** Em produção o cookie nasce `Secure` por imposição do código
  (`ambiente === 'production'`), mas nada aqui termina TLS.
- **Sem trilha de auditoria e sem papéis**: autorizar aqui é só "a sessão é válida"; não registro quem mudou
  quê, e um segundo administrador teria os mesmos direitos do primeiro.
- **Exclusão sem desfazer**: linha do imóvel, linhas das imagens em cascata e os arquivos do disco
  vão embora no mesmo pedido. Sem lixeira.
- **Log não mascara corpo de formulário**: em `test` o logger fica desligado; em dev/prod ele imprime as
  requisições, mas nenhum campo de formulário é ocultado, então um cadastro com dado pessoal pode aparecer
  no log.

## O que testei e como

- **162 testes automatizados em 11 arquivos (Vitest)**, todos contra o app real com `app.inject` e
  SQLite em arquivo temporário por suíte: nenhum teste depende de servidor ligado nem de rede.
- **Domínio isolado**: `imovel-validacoes` (regras por tipologia, incl. andar obrigatório em
  apartamento), `imovel-calculos` (preço por m² sobre área privativa vs construída, arredondamento,
  moeda por praça), `imovel-situacao` (máquina de transições, inclusive vendido sem volta).
- **Rotas e contratos**: `autenticacao` (argon2id, cookie HttpOnly assinado, token adulterado, 429 na
  11ª tentativa, hook protegendo `/admin` e `/api/v1/admin`), `painel-imoveis`, `exclusao-painel`
  (filtros, busca, contagem e exclusão), `fotos-upload` (magic numbers, 5 MB, capa, `/media`),
  `textos`, `catalogo`, `ficha-imovel`.
- **Escape de HTML provado por teste**: título com `<script>alert(1)</script>` (`tests/catalogo.test.ts:421`).
- **Checklist visual**: `tests/checklist-visual.test.ts` confere o HTML/CSS público contra o checklist
  da seção 3.2 (contraste, landmarks, sem estilo inline, `prefers-reduced-motion` desligando as duas
  animações).
- **Ao vivo**: navegador com axe, 360 px e 1280 px, login e cadastro executados de fato, incluindo o
  painel redesenhado.
- **API JSON no Postman**, fora do navegador.
- **Clone limpo no final desta entrega**: cópia dos arquivos versionados para uma pasta vazia e os
  cinco comandos do `banca.json` em sequência, com `GET /saude` respondendo 200. Foi assim que apareceram
  os dois problemas de dependência registrados na decisão #9.

## Onde errei ou mudei de ideia

- Planejava modelar as tipologias como **uma classe adicional só com um campo `tipologia`** e condições dentro.
  Migrei para `Imovel` abstrata + `Apartamento`/`Villa`/`Penthouse`/`Estate` + fábrica porque o R-10 pede
  especialização onde o domínio justifica, e porque o preço por m² tem **área base diferente** por par
  (privativa para apartamento/penthouse, construída para villa/estate): com `if` espalhado, essa
  divergência viria bug silencioso na ficha.
- Deixei de fora, no planejamento, verificações de campos editáveis e testes de segurança; só vi o buraco
  quando comecei a mexer na interface. Isso virou código depois: validação de tipo e faixa nos PUT/POST do
  painel, escape provado por teste, rate limit no login e no `/admin/login`, hash reserva anti-enumeration.
- Padrão de nomes: comecei misturando (`routes`, `rotas`, `.service`, `.servico`) e padronizei tarde em
  `*.rotas.ts` / `*.servico.ts` / `*.repositorio.ts`. A renomeação custou imports que não precisavam ter
  mudado.
- Achei que servir CSS com `@fastify/static` era "o jeito padrão"; troquei por rota própria com allowlist
  de nome (`^[a-z0-9][a-z0-9-]*\.css$`) e `Cache-Control`. O que eu achava que era trabalho, era superfície.
- Na última tarefa, descobri que `prestart` não roda com `ignore-scripts=true` — ou seja, o `npm start` do
  `banca.json` subiria sem `dist/` num clone limpo. Mudar o build de lugar resolveu, e é o tipo de coisa que
  só aparece rodando os comandos de fora, não de dentro da minha máquina.
- Duas coisas que eu tinha por resolvidas e errei na primeira versão do painel: contagem dos filtros por
  eixo (precisava calcular sobre o conjunto dos **demais** eixos) e link da opção ativa (teria que
  **desmarcar**, não reaplicar o filtro).

## O que cortei e por quê

- **Reprocessar foto (re-encode e thumbnail) com `sharp`** — o MVP não exige transformar foto; o custo é
  manter o EXIF do arquivo original, que ficou como limitação declarada.
- **Galeria, lightbox e carrossel** — além de fora do escopo, bibliotecas disso estão na coluna Proibido:
  é parte do que é avaliado.
- **Diagnóstico de alocação, Agendar reunião, Tokenização** — fora do escopo (seção 3.6).
- **Papéis/permissões, cadastro de equipe, recuperação de senha** — um operador só no cenário.
- **Busca textual com FTS5 ou similar** — a busca do painel e do catálogo é por referência/slug/título com
  `LIKE` parametrizado; suficiente para 18 imóveis.
- **Paginação com cursor, cache/CDN, gzip** — sem volume que peça.
- **CI, Docker, swagger** — o enunciado não exige e o tempo estava no domínio. Ficam na lista seguinte.
- **Sanitizador de rich text** — os textos editáveis são texto puro escapado; não há HTML do usuário
  entrando no site.
- **Expiração agendada de sessão e i18n** (es/en) — declarados como dívida, não escondidos.

## O que aprendi

- Autenticação e sessão sem biblioteca pronta: token aleatório na tabela, cookie assinado, `HttpOnly`,
  `SameSite=Lax`, TTL e expurgo. Isso está em `src/modules/auth/auth.servico.ts` e nos testes de
  `autenticacao`.
- SQL puro sem ORM: `prepare`/`run` parametrizado, `JOIN` para o read model do catálogo, FK com
  `ON DELETE CASCADE`, WAL e migrações numeradas (`src/repositories/imoveis/imovel.repositorio.ts`).
- Fastify na prática: plugins com escopo, `addContentTypeParser` para formulário, `setErrorHandler` e
  `setNotFoundHandler` na raiz, `preHandler` como fronteira única de proteção do painel.
- Que "biblioteca fornece primitiva, não o fluxo" é uma linha concreta: argon2 calcula hash, eu decido o
  anti-enumeration; multipart faz o parse, eu decido magic numbers e nome do arquivo.
- CSS orientado a token sem framework: a mesma escala de espaçamento/tipografia do Anexo B serviu site e
  painel, e `prefers-reduced-motion` precisou ser testado, não presumido.
- Que gestão de dependência é parte do entregável: um lockfile gerado numa única plataforma derruba o
  `npm test` de quem avalia.

## O que eu faria com mais tempo

- Container com Docker Compose e um CI que rode exatamente os cinco comandos do `banca.json` num
  container Linux — é o que teria pego o problema do binding do rolldown antes de mim.
- Store de rate limit compartilhada (SQLite ou Redis) e expurgo periódico de sessões vencidas.
- Reprocessar as fotos com `sharp` (remover EXIF + gerar variação de tamanho) e um CDN na frente do `UPLOAD_DIR`.
- CSP e cabeçalhos de hardening, `trust proxy` configurable e origin de CORS fixa por ambiente.
- Carga real com k6/Grafana para descobrir o teto do SQLite em WAL sob leitura de catálogo.
- Swagger/OpenAPI na `/api/v1` e uma trilha de auditoria das ações do painel.
- Testes E2E de browser para os fluxos do painel (hoje o browser é inspeção manual).
- Melhoria estética do site público (espaçamentos e hierarquia da ficha) e recorte das fotos para o ratio
  do card, sem distorcer.

## Uso de ferramentas de IA

Usei IA como consulta de documentação e como par de programação para revisar, me dar sugestões e me explicar partes que eu não domino.

| Ferramenta | Para quê | O que aproveitei | O que descartei e por quê |
|---|---|---|---|
| Agente de código (Qoder / Claude) trabalhando no repositório | consultar API do Fastify que eu não decoro (`@fastify/view` sem layout global, opções do parser de cookie, limites do multipart), achar por que um teste quebrava em cascata, revisar tokens do Anexo B, varrer acessibilidade no browser embutido e escrever trechos de código no par | Documentação e sintaxe exatas em vez de suposição; depuração de cascata (ex.: um fixture de teste sem `banheiros`/`andar` dava 422, `id` indefinido e derrubava os testes seguintes); sugestões de teste que eu não tinha pensado | Sugestões que esbarram na seção 5.1 (framework de UI, lib de animação, `@fastify/static` para o upload, JWT no lugar de tabela de sessão); validação feita só no cliente/navegador, porque a regra do catálogo tem que valer na escrita; confirmação de exclusão em modal, que eu descartei por decisão de fluxo; qualquer código que eu não conseguia explicar linha a linha |
| Agente de código (Gemini 3.8 Flash / Antigravity) | Ajuda na pesquisa dos topicos onde eu não domino | Sugestões sobre as issues | Modelo de herança com classe intermediaria de imoveis, que tornaria redundante a aplicação de herança nos tipos específicos de imoveis |

## Tempo gasto

| Tarefa | Minutos |
|---|---|
| T0 · Leitura do enunciado e dos anexos | 75 |
| T1 · Base, migrações e `semear` | 60 |
| T2 · Domínio e testes | 60 |
| T3 · Entrar, sair e proteger o painel | 30 |
| T4 · Painel de imóveis | 40 |
| T5 · Fotos | 30 |
| T6 · Site público | 20 |
| T7 · Textos editáveis | 30 |
| T8 · Animações e checklist visual | 30 |
| T9 · README, Diário e diagrama | 120 |
| Outros · testes além das tarefas (debug de cascata em fixture) | 40 |
| Outros · Melhoria visual no painel | 30 |
| Outros · estudo de segurança e testes | 40 |
| **Total** | **605 min (10 h 5 min)** |

