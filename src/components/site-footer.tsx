export function SiteFooter() {
  return (
    <footer className="border-t py-6 text-center text-sm text-muted-foreground">
      <div className="container mx-auto px-4">
        <p>© {new Date().getFullYear()} Zonaprop Monitor</p>
      </div>
    </footer>
  );
}
