# 🏢 Real Estate Portfolio API

API REST desenvolvida em **Node.js** com **TypeScript** e **Fastify**, focada no gerenciamento e controle de portfólio imobiliário.

---

## 🚀 Tecnologias

- [Node.js](https://nodejs.org/) (ES Modules)
- [TypeScript](https://www.typescriptlang.org/)
- [Fastify](https://fastify.dev/)
- [@fastify/cors](https://github.com/fastify/fastify-cors)
- [Vitest](https://vitest.dev/) (Testes automatizados)
- [tsx](https://github.com/privatenumber/tsx) (Execução e watch em desenvolvimento)

---

## 📁 Estrutura de Pastas

```text
src/
├── config/        # Configurações gerais da aplicação
├── controllers/   # Controladores (lógica de requisição/resposta)
├── routes/        # Definição das rotas e endpoints
│   └── saude.ts   # Rota de healthcheck (/saude)
├── services/      # Regras de negócio da aplicação
├── utils/         # Funções utilitárias e helpers
├── app.ts         # Configuração e plugins do Fastify (buildApp)
└── server.ts      # Inicialização do servidor HTTP
```

---

## ⚙️ Pré-requisitos

- **Node.js** (v18+ recomendado)
- **npm** (ou gerenciador de pacotes equivalente)

---

## 🛠️ Instalação e Execução

### 1. Clonar o repositório
```bash
git clone https://github.com/Gabrieldnb7/realEstate-portfolio.git
cd realEstate-portfolio
```

### 2. Instalar as dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente (se aplicável)
Crie um arquivo `.env` na raiz do projeto:
```env
PORT=3000
```

### 4. Executar em modo de desenvolvimento
Inicia a aplicação com hot-reload utilizando o `tsx`:
```bash
npm run dev
```

O servidor estará rodando em: `http://localhost:3000`

---

## 🧪 Testes

Para executar a suíte de testes com **Vitest**:

```bash
# Modo watch (interativo)
npm run test

# Execução única
npm run test:run
```

---

## 📦 Build e Produção

Para compilar o código TypeScript para JavaScript:

```bash
# Gerar arquivos compilados na pasta dist/
npm run build

# Iniciar o servidor em produção
npm start
```

---

## 📍 Rotas Disponíveis

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/saude` | Healthcheck para verificar se a API está online |

---

## 📄 Licença

Este projeto está sob a licença [ISC](LICENSE).
