# Mr. Boom

Site de treino de hipertrofia: cada pessoa cria a própria conta, espera a liberação do administrador e vê o próprio treino, com bonecos animados, cronômetro de descanso e registro de cargas que aparece em todos os celulares em que ela entrar.

- `index.html`: o site
- `api/conta.js`: criar conta, entrar, liberar ou recusar pedidos e guardar as respostas das perguntas do primeiro acesso
- `api/logs.js`: guarda as cargas de cada pessoa num banco de dados (Redis da Upstash, ligado pela Vercel)
- `api/_lib.js`: o que as duas rotas usam em comum (banco, senhas e sessões)
- `api/_desempenho.js`: calcula o desempenho de cada pessoa a partir das cargas anotadas (usado por `api/conta.js`)
- `sw.js` e `manifest.webmanifest`: deixam o site abrir sem internet e ser instalado no celular como aplicativo, com os ícones `icon-192.png`, `icon-512.png`, `icon-maskable.png` e `apple-touch-icon.png`

## Como funciona a entrada

- Quem quer usar o Mr. Boom toca em **Criar conta** na tela de entrada e escolhe nome, usuário e senha. A conta fica esperando liberação.
- O administrador entra com o usuário `joao` e a senha que é a variável `TREINO_PIN` da Vercel. No menu **Pessoas**, ele vê os pedidos e toca em **Liberar** ou **Recusar**. Enquanto houver pedidos, aparece um aviso no topo do treino dele.
- Depois de liberada, a pessoa responde 8 perguntas: quantos dias e quais dias treina, há quanto tempo faz musculação, quanto tempo tem por treino, se quer dar mais atenção a alguma parte do corpo, peso e altura (se quiser), se tem lesão ou limitação e se tem alguma situação de saúde que pede liberação médica. Com 2 ou 3 dias, o treino é de corpo inteiro; com 4, é dividido em parte de cima e pernas. As fases contam a partir do dia em que ela começa.
- Quem já tinha treino antes das perguntas de saúde vê um aviso no alto do treino para responder as 3 perguntas novas. O começo do ciclo não muda.
- A senha é digitada uma vez em cada celular. O site grava um cookie que vale 400 dias e se renova a cada uso, então a pessoa continua logada até tocar em **Sair**.
- Cada pessoa vê e grava só as próprias cargas.
- Se alguém esquecer a senha, o administrador define uma nova em **Pessoas → Trocar senha**. Os celulares dessa pessoa pedem a senha nova uma vez.
- Depois de 10 senhas erradas seguidas, o site espera 15 minutos antes de aceitar novas tentativas daquele endereço. Cada conexão cria no máximo 10 contas por hora, e ficam no máximo 30 pedidos esperando.

## Saúde e lesões

- **Lesões e limitações.** Para cada parte marcada (pescoço, ombro, cotovelo ou punho, lombar, quadril, joelho, tornozelo ou pé, osteoporose), o treino troca os exercícios que costumam forçar aquela parte, sem repetir exercício no mesmo dia, e escreve um cuidado no cartão dos que continuam. O exercício trocado mostra no nome o que ele substituiu. No alto do treino aparecem a escala de dor e a lista do que mudou. Em **Outra**, o app não troca nada e pede para a pessoa perguntar ao fisioterapeuta ou ao professor.
- **Liberação médica.** Quem marca que tem uma situação de saúde e ainda não falou com um médico vê, no alto do treino, o aviso para passar pelo médico antes de começar.
- **Proteína.** Com o peso, a seção Proteína mostra quanto comer por dia (1,6 g por kg). Se o peso e a altura indicarem IMC de 30 ou mais, a seção indica um nutricionista em vez de dar um número.
- **Privacidade.** As respostas de saúde aparecem só para a própria pessoa. A lista **Pessoas** mostra nome, usuário, modelo de treino e o desempenho (treinos e cargas anotados), nunca as respostas de saúde. A tela de criar conta avisa que o administrador acompanha os treinos e as cargas. Os dados ficam guardados no Redis da Upstash, junto com a conta da pessoa: são dados de saúde, então deixe o acesso à Vercel e à Upstash só com você. Para apagar, a pessoa refaz as perguntas deixando peso e altura em branco e marcando **Não tenho**, ou o administrador remove a conta.

## Visual

- **Marca.** O símbolo é uma explosão com pontas, porque formas angulosas passam ideia de força e resistência. O laranja fica só no símbolo e nos botões principais. Os ícones do aplicativo usam o mesmo símbolo sobre fundo escuro.
- **Leitura.** A letra é a Atkinson Hyperlegible, feita para ser fácil de ler. O passo a passo dos exercícios usa 17 px, porque instruções fáceis de ler fazem o exercício parecer mais fácil de fazer. Texto escuro sobre fundo claro é o padrão; o modo escuro aparece quando o celular está nele.
- **Toque.** Marcar exercício feito tem 54 px, e os outros botões têm pelo menos 44 a 48 px, para acertar com o polegar.
- **Menos coisa na tela.** Como progredir, Proteína, Cuidados, Por que o treino é assim e Registro de cargas começam recolhidas e abrem com um toque. O Registro abre sozinho quando há cargas esperando para ir à nuvem.
- **Progresso.** O treino do dia mostra quanto falta, e a fase mostra a semana do ciclo.

## Desempenho em Pessoas (só o administrador)

- **No ícone.** Cada pessoa com acesso tem um anel: o número no meio é quanto dos treinos combinados ela fez nas últimas 4 semanas (ou desde o começo, se começou há menos tempo). Ao lado aparece a situação, com ícone e texto: **Em dia** (75% ou mais), **Irregular**, **Parado** (nada anotado há mais de 14 dias), **Sem cargas anotadas** ou **Ainda não respondeu as perguntas**.
- **Na janela.** Tocar no anel abre uma janela com os treinos por semana (8 semanas, com a meta tracejada), o último treino, as semanas seguidas na meta, o volume (carga × repetições) e a carga de cada exercício desde o começo do plano.
- **Como conta.** Um treino conta quando há carga ou repetição anotada no dia: treino feito sem anotar não aparece. A meta são os dias por semana que a pessoa escolheu. Se a média das últimas 4 semanas fica abaixo de 2 treinos, a janela lembra que a OMS recomenda fortalecimento muscular em pelo menos 2 dias por semana. Acompanhar o próprio progresso ajuda a chegar na meta (Harkin et al., 2016, *Psychological Bulletin*, meta-análise de 138 estudos).

## Cores, e por quê

- **Nada depende só da cor.** Cerca de 8% dos homens e 0,4% a 0,5% das mulheres têm algum tipo de daltonismo, quase sempre vermelho-verde (Birch, 2012, *JOSA A*; Simunovic, 2010, *Eye*). Por isso a situação de cada pessoa tem ícone e texto, as barras abaixo da meta são listradas e a semana mostra o nome de cada treino embaixo da cor.
- **Anilhas que daltônicos separam.** As cores dos treinos continuam as das anilhas olímpicas, mas o vermelho ficou mais fechado (#B5300F) e o verde puxou para o azul (#00806B), como na paleta de Okabe e Ito (*Color Universal Design*). Na simulação de protanopia, a diferença entre o treino C e o D subiu de ΔE 11,5 (quase iguais) para 36. O amarelo não chega a 3:1 no branco, então ganhou uma borda escura onde a cor é a única marca.
- **Contraste.** Texto com pelo menos 4,5:1 e bordas de campos, anel e barras com pelo menos 3:1 (WCAG 2.2, critérios 1.4.3 e 1.4.11). As bordas dos campos e do botão de marcar feito passaram de 1,38:1 para 3,5:1, e o laranja dos botões, de 2,95:1 para 3,19:1.
- **Um tom só, quente, para quantidade.** O desempenho usa só o laranja da marca (#DE6112, um pouco mais fechado para passar de 3:1 também no fundo cinza): o tamanho do anel e a altura das barras mostram o quanto, como nos esquemas sequenciais do ColorBrewer (Harrower e Brewer, 2003). **Em dia** é o selo laranja cheio, **Irregular** é o mesmo laranja só no contorno, e **Parado** fica em cinza, sempre com ícone e texto.
- **Frio não é triste; escuro e cinza é que são.** No estudo com 4.598 pessoas de 30 países (Jonauskaite et al., 2020, *Psychological Science*), tristeza ficou ligada ao preto e ao cinza. Brilho pesa mais na sensação de prazer do que o tom (Valdez e Mehrabian, 1994). Cor mais saturada e clara aumenta a agitação, e não necessariamente a sensação boa (Wilms e Oberfeld, 2018). O laranja foi escolha de preferência e de identidade com a marca.
- **Vermelho só para alerta de saúde.** O vermelho aparece só no aviso de procurar um médico. A ideia de que ver vermelho atrapalha o desempenho (Elliot et al., 2007) não se confirmou depois: uma meta-análise de 2020 (Gnambs, *Psychonomic Bulletin & Review*) não achou efeito depois de corrigir o viés de publicação. Então o vermelho não foi tirado por "psicologia das cores", e sim para não confundir aviso de saúde com desempenho.
- **O que a teoria das cores não sustenta.** Os efeitos de cor no esporte são pequenos e dependem do contexto: vestir vermelho pesou só em lutas equilibradas (Hill e Barton, 2005, *Nature*), e ver verde baixou o esforço percebido em bicicleta (Akers et al., 2012), mas não em corrida (Briki e Majed, 2019). Por isso as decisões aqui seguem legibilidade e acessibilidade, que têm evidência forte, e não promessas de motivação pela cor.

## Como publicar (uns 10 minutos, tudo pelo navegador)

1. **Crie o repositório no GitHub.** Entre em github.com, clique em **New**, dê um nome, como `mrboom`, marque **Private** e clique em **Create repository**.
2. **Envie os arquivos.** Na página do repositório, clique em **uploading an existing file**. Arraste o `index.html`, o `sw.js`, o `manifest.webmanifest`, os ícones, a pasta `api` e este `README.md` e clique em **Commit changes**. Confira se os quatro arquivos `.js` da API ficaram dentro da pasta `api`.
3. **Importe na Vercel.** Entre em vercel.com com **Continue with GitHub**. Clique em **Add New… → Project**, escolha o repositório, clique em **Import** e depois em **Deploy**, sem mudar nada.
4. **Ligue o banco de dados.** No projeto, abra a aba **Storage**, clique em **Create Database** e escolha **Upstash for Redis**, no plano **Free**. Conecte ao projeto, com Production, Preview e Development marcados. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
5. **Crie a senha do administrador.** Em **Settings → Environment Variables**, adicione a variável `TREINO_PIN` com uma senha só sua e clique em **Save**.
6. **Publique de novo.** Na aba **Deployments**, abra o menu **⋯** do último deploy e clique em **Redeploy**, para o banco e a senha passarem a valer.
7. **Teste.** Abra o endereço do site e entre com o usuário `joao` e a senha do administrador. Mande o endereço para quem vai usar: cada pessoa cria a própria conta, e você libera em **Pessoas**.

## Atualizar o site depois

No GitHub, use **Add file → Upload files** para substituir os arquivos. Para os arquivos da API, entre primeiro na pasta `api` e faça o upload lá dentro. A Vercel publica a versão nova sozinha em cerca de um minuto. Com internet, o celular sempre abre a versão nova. A cópia guardada só é usada quando não há sinal.

## Bom saber

- Anote a carga e as repetições de cada série. É pelas repetições que o app avisa quando dá para subir a carga e quando é melhor baixar um pouco.
- Exercícios com alternativa têm a escolha **Principal / Alternativa** no alto do cartão. Escolhendo a alternativa, o nome, a animação, o passo a passo e o registro de cargas passam a ser dela.
- A seção **Por que o treino é assim** explica cada escolha com o estudo que a sustenta: tríceps com o braço acima da cabeça, panturrilha trabalhando alongada, agachamento fundo, ritmo das repetições, treino com lesão e outras.
- A seção **Seu progresso** mostra os dias de treino das últimas 4 semanas, o que ajustar no próximo treino e a evolução da carga em cada exercício.
- Em **Registro de cargas**, o botão **Baixar planilha** gera um arquivo com as cargas da pessoa, que abre no Excel e no Google Planilhas.
- Para usar como aplicativo: no Android, toque em **Instalar** no aviso do site ou, no Chrome, em **⋮ → Instalar app**. No iPhone, abra no Safari, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**. No iPhone, o app da tela inicial pede a senha uma vez, separado do Safari.
- Se a internet cair na academia, a anotação fica guardada no celular e vai sozinha para a nuvem quando a conexão voltar, mesmo que o site seja fechado antes.
- Para trocar a senha do administrador, mude a variável `TREINO_PIN` na Vercel e faça **Redeploy**.
