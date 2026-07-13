// Seed inicial: superadmin + tenant de demonstração (padaria) com catálogo.
// Uso: pnpm db:seed
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@iahumanizada.com.br").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Super Admin",
      role: "SUPERADMIN",
      passwordHash: await argon2.hash(password),
    },
  });
  console.log(`✔ superadmin: ${admin.email}`);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "padaria-demo" },
    update: {},
    create: {
      name: "Padaria Pão Quente (demo)",
      slug: "padaria-demo",
      segment: "PADARIA",
      description:
        "Padaria artesanal aberta desde 2010. Pães de fermentação natural, bolos por encomenda, salgados e café da manhã. Aceitamos encomendas com 24h de antecedência.",
      address: "Rua das Flores, 123 — Centro",
      phoneDisplay: "(11) 99999-0000",
      businessHours: {
        seg: [{ inicio: "06:00", fim: "19:00" }],
        ter: [{ inicio: "06:00", fim: "19:00" }],
        qua: [{ inicio: "06:00", fim: "19:00" }],
        qui: [{ inicio: "06:00", fim: "19:00" }],
        sex: [{ inicio: "06:00", fim: "19:00" }],
        sab: [{ inicio: "06:00", fim: "13:00" }],
        dom: [],
      },
      aiConfig: {
        create: {
          systemPrompt: [
            "Você é a Ana, atendente virtual da Padaria Pão Quente. Você é calorosa, simpática e fala como uma atendente de padaria de bairro em português brasileiro.",
            "Você ajuda clientes com: informações sobre produtos e preços, encomendas de bolos e salgados, horário de funcionamento e endereço.",
            "Encomendas precisam de 24h de antecedência. Para encomendas, anote: produto, quantidade, data de retirada e nome do cliente — e então transfira para um atendente humano confirmar.",
          ].join("\n"),
        },
      },
      catalogItems: {
        create: [
          { category: "Pães", name: "Pão francês (un)", priceCents: 90 },
          { category: "Pães", name: "Pão de fermentação natural 500g", priceCents: 1890 },
          { category: "Pães", name: "Pão de queijo (un)", priceCents: 450 },
          { category: "Bolos", name: "Bolo de cenoura com chocolate", priceCents: 3500, description: "Serve 10 fatias. Encomenda com 24h." },
          { category: "Bolos", name: "Bolo de fubá", priceCents: 2800, description: "Serve 10 fatias." },
          { category: "Salgados", name: "Coxinha (un)", priceCents: 750 },
          { category: "Salgados", name: "Cento de salgados para festa", priceCents: 12000, description: "Mistura de coxinha, bolinha de queijo e risole. Encomenda com 48h." },
          { category: "Bebidas", name: "Café coado (copo)", priceCents: 500 },
          { category: "Bebidas", name: "Suco de laranja natural 300ml", priceCents: 900 },
        ],
      },
    },
  });
  console.log(`✔ tenant demo: ${tenant.name} (${tenant.id})`);
  console.log("\nPronto! Login no dashboard:");
  console.log(`  e-mail: ${email}`);
  console.log(`  senha:  ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
