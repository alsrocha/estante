# Pendências

App pessoal de **metas da semana**, **lembretes** e **avisos com validade**. Instala na tela inicial do celular (PWA), funciona sem internet e te lembra todo dia, por notificação, do que ainda está pendente, até você marcar como resolvido.

Os dados ficam só no celular (IndexedDB). Use Configurações › Exportar backup de vez em quando.

## Endereço
Fica dentro do site do Estante, que já está no GitHub Pages: **https://alsrocha.github.io/estante/pendencias/**

## Instalar no celular (Android)
1. Abra o link no **Chrome**.
2. Toque em **Instalar** no aviso do app (ou menu ⋮ › *Instalar app*).
3. Abra o app pelo ícone e toque em **Permitir notificações**.
4. Em Configurações do Android › Apps › Chrome › Bateria, escolha **Sem restrições**.
5. No app, Configurações › **Enviar notificação de teste**.

No iPhone: Safari › Compartilhar › *Adicionar à Tela de Início* (iOS 16.4 ou mais novo para notificações).

## Como funciona a notificação diária
- **Sem servidor (já vem ativo):** o Chrome no Android acorda o app algumas vezes por dia (Periodic Background Sync, só com o app instalado). Na primeira vez depois do horário escolhido, sai o resumo. Também sai ao abrir o app, se ainda não tiver saído no dia.
  - Garante: o resumo aparece no dia, sem custo e sem nada sair do celular.
  - Não garante: o minuto exato. O Android decide quando acordar o app e pode atrasar horas com economia de bateria. No iPhone esse modo não existe.
- **Push via GitHub (opcional, mais pontual):** um agendador gratuito do GitHub manda um “toque” no horário e o app monta o resumo com os dados do celular.
  1. No app: Configurações › *Push diário mais confiável* › **Gerar chaves e ativar push** › **Copiar configuração**.
  2. No GitHub: Settings › Secrets and variables › Actions › **New repository secret**. Nome `PUSH_CONFIG`, valor: o que você copiou.
  3. Actions › *Pendências - resumo diário (push)* › **Run workflow** para testar.
  4. O horário fica em `.github/workflows/pendencias-push.yml` (na raiz do repositório), em UTC (`0 11 * * *` = 08:00 de Brasília).
  - Atenções: o GitHub pode atrasar o agendamento alguns minutos (às vezes mais em horários de pico) e pausa agendamentos de repositórios sem nenhum commit há 60 dias (basta reativar em Actions). Se trocar de celular ou reinstalar o app, gere a configuração de novo e atualize o secret.

## Arquivos
- `index.html`: o app (telas e lógica).
- `core.js`: banco local, datas e montagem do resumo (usado pela tela e pelo service worker).
- `sw.js`: offline, notificação em segundo plano e push.
- `manifest.webmanifest` e `icons/`: instalação na tela inicial, atalhos “Novo lembrete/aviso/meta” e receber links compartilhados de outros apps (viram um Aviso).
- `push/` e `../.github/workflows/pendencias-push.yml`: envio opcional do push diário.
