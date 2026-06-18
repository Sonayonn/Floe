import { Atmosphere } from "./Atmosphere";
import { TopNav } from "./TopNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Atmosphere />
      <TopNav />
      <main className="floe-main">
        <div className="floe-container">{children}</div>
      </main>
    </>
  );
}
