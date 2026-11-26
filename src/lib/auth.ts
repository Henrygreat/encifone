import type { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
// Side effect: defaults process.env.NEXTAUTH_URL from APP_URL if unset,
// before NextAuth's own lazy env read ever runs. Also validates env.
import { env } from "@/lib/env";

const providers: AuthOptions["providers"] = [
  CredentialsProvider({
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const user = await prisma.user.findUnique({
        where: { email: credentials.email.toLowerCase() },
      });
      if (!user?.passwordHash) return null;

      const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
      if (!isValid) return null;

      return { id: user.id, email: user.email, name: user.name, image: user.image };
    },
  }),
];

// Google OAuth is optional in local/dev — only registered when credentials are configured.
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  // NextAuth v4 otherwise auto-detects `process.env.NEXTAUTH_SECRET`, which
  // this app never sets (our own var is AUTH_SECRET) — passing it
  // explicitly is required, not optional. See docs/DECISION_LOG.md.
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
};

export function getServerAuthSession() {
  return getServerSession(authOptions);
}
