import { colors, radii } from "@echo/design-tokens";

export default function Home() {
  return (
    <main
      className="min-h-screen p-6"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      <section
        className="mx-auto max-w-3xl border p-6"
        style={{ borderColor: "#d7dcf0", borderRadius: radii.medium }}
      >
        <p className="text-xs font-bold tracking-[0.2em]" style={{ color: colors.primary }}>
          ECHO
        </p>
        <h1 className="mt-2 text-3xl font-bold">教师端</h1>
      </section>
    </main>
  );
}
