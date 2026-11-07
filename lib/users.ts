import crypto from "crypto";

export type Role = "admin" | "responsavel" | "cliente" | "diretor-comercial" | "operacional" | "comercial";

export interface User {
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
  cnpjs?: string[];
}

function hash(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Hash SHA-256 da senha inicial, definido no ambiente (ARES_DEFAULT_PASSWORD_HASH).
// Sem ele, ninguém com a senha padrão consegue entrar.
const DEFAULT = process.env.ARES_DEFAULT_PASSWORD_HASH ?? "!";

export const USERS: User[] = [
  { username: "felipe",    name: "Felipe",    role: "admin",       passwordHash: DEFAULT },
  { username: "fabricio",  name: "Fabrício",  role: "admin",       passwordHash: DEFAULT },
  { username: "weverton",  name: "Weverton",  role: "admin",       passwordHash: DEFAULT },
  { username: "jheniffer", name: "Jheniffer", role: "responsavel", passwordHash: DEFAULT },
  { username: "lais",      name: "Laís",      role: "responsavel", passwordHash: DEFAULT },
  { username: "luany",     name: "Luany",     role: "responsavel", passwordHash: DEFAULT },
  { username: "ranyeri",   name: "Ranyeri",   role: "responsavel", passwordHash: DEFAULT },
  { username: "taylon",    name: "Taylon",    role: "responsavel", passwordHash: DEFAULT },
  { username: "juliana",   name: "Juliana",   role: "responsavel", passwordHash: DEFAULT },
  { username: "sabrina",   name: "Sabrina",   role: "responsavel", passwordHash: DEFAULT },
  { username: "marcos",    name: "Marcos",    role: "responsavel", passwordHash: DEFAULT },
  { username: "diana",     name: "Diana",     role: "responsavel", passwordHash: DEFAULT },
  { username: "mayara",    name: "Mayara",    role: "responsavel", passwordHash: DEFAULT },
  { username: "kamilla",   name: "Kamilla",   role: "responsavel", passwordHash: DEFAULT },
  { username: "acsa",      name: "Acsa",      role: "responsavel", passwordHash: DEFAULT },

  // Operacional — acesso restrito a /performance e /sla-entregas
  { username: "lucas",     name: "Lucas",     role: "operacional", passwordHash: DEFAULT },
  { username: "kennedy",   name: "Kennedy",   role: "admin",        passwordHash: DEFAULT },

  // Comercial — acesso a /comercial e /sla-entregas
  { username: "beatriz",   name: "Beatriz",   role: "comercial",   passwordHash: DEFAULT },
  { username: "vanessa",   name: "Vanessa",   role: "comercial",   passwordHash: DEFAULT },

  // Diretores comerciais — acesso restrito a /performance e /comercial
  { username: "tiago",     name: "Tiago",     role: "admin", passwordHash: DEFAULT },
  { username: "john",      name: "John",      role: "diretor-comercial", passwordHash: DEFAULT },
  { username: "ronaldo",   name: "Ronaldo",   role: "admin", passwordHash: DEFAULT },
  { username: "kayque",    name: "Kayque",    role: "admin", passwordHash: DEFAULT },

  // Clientes externos
  {
    username: "medlevensohn", name: "Medlevensohn", role: "cliente", passwordHash: DEFAULT,
    cnpjs: [
      "25.346.626/0001-85","27.986.353/0001-69","00.577.604/0003-67","05.343.029/0001-90",
      "06.626.253/0001-51","48.495.866/0001-47","46.523.056/0001-21","27.844.493/0001-00",
      "26.571.648/0001-01","07.122.223/0001-70","50.644.565/0001-80","45.739.083/0001-73",
      "16.647.278/0001-95","61.585.865/2128-41",
    ],
  },
  {
    username: "payot", name: "Payot", role: "cliente", passwordHash: DEFAULT,
    cnpjs: [
      "12.806.592/0001-12","61.183.729/0008-01","49.768.372/0001-51","07.246.802/0001-25",
      "02.167.473/0002-94","32.356.707/0001-21","02.167.473/0001-03","02.167.473/0004-56",
    ],
  },
  {
    username: "aspenpharma", name: "Aspen Pharma", role: "cliente", passwordHash: DEFAULT,
    cnpjs: [
      "17.008.753/0001-46","04.899.316/0351-75","73.773.129/0001-06","88.212.113/0160-14",
      "02.433.631/0001-20","03.649.560/0001-60","24.112.048/0001-50","04.425.347/0002-18",
      "73.081.382/0001-07","59.610.485/0001-88","09.403.367/0001-20","07.593.518/0001-25",
      "31.672.475/0001-58","01.122.809/0002-30","61.190.096/0008-69",
    ],
  },
  {
    username: "zydus", name: "Zydus", role: "cliente", passwordHash: DEFAULT,
    cnpjs: [
      "01.206.820/0031-12","07.224.991/0006-40","04.899.316/0351-75","05.254.971/0012-34",
      "06.626.253/0633-15","07.224.991/0015-30","01.206.820/0024-93","07.224.991/0011-07",
      "07.224.991/0017-00","61.940.292/0055-20","61.940.292/0066-82","04.429.478/0001-92",
      "01.206.820/0032-01","06.626.253/1493-84","01.206.820/0008-73","61.940.292/0064-10",
      "07.224.991/0012-98","06.626.253/0669-26","06.626.253/0875-08","06.626.253/0124-00",
      "61.940.292/0056-00","89.735.070/0001-00","45.453.214/0024-48","04.899.316/0252-93",
    ],
  },
  {
    username: "biochimico", name: "Biochímico", role: "cliente", passwordHash: DEFAULT,
    cnpjs: ["23.668.196/0002-73"],
  },
  {
    username: "caudalie", name: "Caudalie", role: "cliente", passwordHash: DEFAULT,
    cnpjs: ["15.204.861/0008-35"],
  },
  {
    username: "clarevet", name: "Clare Vet", role: "cliente", passwordHash: DEFAULT,
    cnpjs: ["50.765.434/0001-50"],
  },
  {
    username: "oncovit", name: "Oncovit", role: "cliente", passwordHash: DEFAULT,
    cnpjs: ["07.826.037/0001-12","10.586.940/0001-68"],
  },
  {
    username: "unilog", name: "Unilog Express", role: "cliente", passwordHash: DEFAULT,
    cnpjs: ["05.656.727/0001-20","05.656.727/0001-45","13.537.247/0001-93"],
  },
];

export function findUser(username: string, password: string): User | null {
  const user = USERS.find(u => u.username === username.toLowerCase().trim());
  if (!user) return null;
  if (user.passwordHash !== hash(password)) return null;
  return user;
}
