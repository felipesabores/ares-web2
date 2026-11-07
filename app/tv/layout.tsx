export default function TVLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {children}
    </div>
  );
}
