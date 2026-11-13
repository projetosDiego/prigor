# Segurança do Doces Prigor OS

## O que o sistema já faz

- Senhas com bcrypt, sessão em cookie `httpOnly`, `sameSite=lax` e `secure` em produção.
- Toda rota `/api` e `/admin` exige login; rotas de gestão exigem perfil ADMIN ou MANAGER.
- Limite de tentativas de login por IP **e por conta**.
- Mensagem igual para "e-mail inexistente" e "senha errada".
- Cabeçalhos de segurança: HTTPS forçado (HSTS), sem câmera, microfone e localização, o site não pode
  ser embutido em outro site, formulários só enviam para o próprio domínio.
- Registro de ações sensíveis (login, baixa de pagamento, estorno, estorno em lote, cancelamento de pedido).

## Ações suas (não dá para fazer só pelo código)

### 1. Trocar a senha do e-mail (urgente)
A senha do e-mail `contato@` estava escrita no código e, por isso, ficou no histórico do GitHub.
Mesmo removida agora, **considere-a vazada**:

1. Troque a senha da conta no painel da Hostinger.
2. Na VPS, edite `/opt/prigor/.env` e coloque a nova senha em `SMTP_PASS="..."`.
3. Reinicie: `cd /opt/prigor && docker compose -f docker-compose.prod.yml --env-file .env up -d`.

Sem `SMTP_PASS` no `.env`, o envio de e-mails fica desligado.

### 2. Conta do GitHub
Ative a verificação em duas etapas e confirme que o repositório é **privado**.

### 3. Servidor (VPS)
Rode um por vez, no servidor:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo apt install -y fail2ban unattended-upgrades
sudo systemctl enable --now fail2ban
```

Confira que o Postgres **não** está exposto para a internet:

```bash
sudo ss -tlnp | grep 5432
```

Só pode aparecer `127.0.0.1` ou nada. Se aparecer `0.0.0.0:5432`, feche essa porta.

Acesso SSH só por chave (desligue a senha): em `/etc/ssh/sshd_config` deixe `PasswordAuthentication no` e
`PermitRootLogin no`, depois `sudo systemctl restart ssh`. Antes, confirme que sua chave funciona.

### 4. Senhas e acessos do sistema
- Use senhas diferentes e longas para cada usuário, e desative quem saiu da equipe (Usuários).
- Revise de vez em quando quem tem perfil ADMIN ou MANAGER.
- Mantenha `CRON_SECRET` vazio se não usa o envio automático.
- Depois da primeira subida, deixe `RUN_SEED=false` e apague `ADMIN_PASSWORD` do `.env`.

### 5. Arquivo .env
Contém as chaves do Sicoob, do banco e do e-mail. Na VPS: `chmod 600 /opt/prigor/.env`.
Nunca envie o `.env` por WhatsApp ou e-mail. Guarde uma cópia do `.env` em lugar seguro (gerenciador de senhas).
