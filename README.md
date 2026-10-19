# Treino João & Haniere

Site do treino na DAY FIT: treinos de cada um, bonecos animados, cronômetro de descanso e registro de cargas que aparece em todos os celulares.

- `index.html`: o site
- `api/logs.js`: guarda as cargas num banco de dados (Redis da Upstash, ligado pela Vercel)
- `sw.js` e `manifest.webmanifest`: deixam o site abrir sem internet e ser instalado no celular como aplicativo, com os ícones `icon-192.png`, `icon-512.png`, `icon-maskable.png` e `apple-touch-icon.png`

## Como publicar (uns 10 minutos, tudo pelo navegador)

1. **Crie o repositório no GitHub.** Entre em github.com, clique em **New**, dê o nome `treino-dayfit`, marque **Private** e clique em **Create repository**.
2. **Envie os arquivos.** Na página do repositório, clique em **uploading an existing file**. Arraste o `index.html`, a pasta `api` e este `README.md` e clique em **Commit changes**. Confira se o `logs.js` ficou dentro da pasta `api`.
3. **Importe na Vercel.** Entre em vercel.com com **Continue with GitHub**. Clique em **Add New… → Project**, escolha `treino-dayfit`, clique em **Import** e depois em **Deploy**, sem mudar nada. Se o repositório não aparecer, clique em **Adjust GitHub App Permissions** e libere o acesso a ele.
4. **Ligue o banco de dados.** No projeto, abra a aba **Storage**, clique em **Create Database** e escolha **Upstash for Redis**, no plano **Free**. Crie o banco e conecte ao projeto, com Production, Preview e Development marcados. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
5. **Crie o código do treino.** Em **Settings → Environment Variables**, adicione a variável `TREINO_PIN` com um código só de vocês, por exemplo 4 números, e clique em **Save**. É esse código que libera a gravação de cargas.
6. **Publique de novo.** Na aba **Deployments**, abra o menu **⋯** do último deploy e clique em **Redeploy**, para o banco e o código passarem a valer.
7. **Teste.** Abra o endereço do site, algo como `treino-dayfit.vercel.app`. Digite o código do treino uma vez em cada celular. A linha de status fica verde quando as cargas estão indo para a nuvem.
8. **Mande para o Haniere.** Envie o link com `#haniere` no final, para abrir direto no treino dele.

## Trazer as cargas que já foram anotadas

1. Na página antiga, vá em **Registro de cargas** e toque em **Copiar backup**.
2. No site novo, digite o código do treino primeiro.
3. Depois toque em **Restaurar backup**, cole o texto e toque em **Restaurar**.

## Atualizar o site depois

No GitHub, use **Add file → Upload files** para substituir o `index.html`. A Vercel publica a versão nova sozinha em cerca de um minuto. Com internet, o celular sempre abre a versão nova. A cópia guardada só é usada quando não há sinal.

## Bom saber

- Qualquer pessoa com o link consegue ver o treino e as cargas. Só quem tem o código do treino consegue gravar.
- Anote a carga e as repetições de cada série. É pelas repetições que o app avisa quando dá para subir a carga e quando é melhor baixar um pouco.
- Exercícios com alternativa têm a escolha **Principal / Alternativa** no alto do cartão. Escolhendo a alternativa, o nome, a animação, o passo a passo e o registro de cargas passam a ser dela.
- A seção **Seu progresso** mostra os dias de treino das últimas 4 semanas, o que ajustar no próximo treino e a evolução da carga em cada exercício.
- Em **Registro de cargas**, o botão **Baixar planilha** gera um arquivo com todas as cargas, que abre no Excel e no Google Planilhas.
- Para usar como aplicativo: no Android, toque em **Instalar** no aviso do site ou, no Chrome, em **⋮ → Instalar app**. No iPhone, abra no Safari, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**.
- Se a internet cair na academia, a anotação fica guardada no celular e vai sozinha para a nuvem quando a conexão voltar, mesmo que o site seja fechado antes.
- Para trocar o código, mude a variável `TREINO_PIN` na Vercel e faça **Redeploy**.
