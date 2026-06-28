import { AuthBar } from "./AuthBar";

type Props = {
  brandName: string;
  audience: string;
  chainCode?: string;
};

export function BrandHeader({ brandName, audience, chainCode }: Props) {
  return (
    <header className="site-header">
      <div className="site-brand">
        <a href="/" className="site-brand-link">
          {brandName}
        </a>
      </div>
      <AuthBar audience={audience} chainCode={chainCode} />
    </header>
  );
}
