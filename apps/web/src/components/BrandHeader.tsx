import { AuthBar } from "./AuthBar";

type Props = {
  brandName: string;
  audience: string;
};

export function BrandHeader({ brandName, audience }: Props) {
  return (
    <header className="site-header">
      <div className="site-brand">
        <a href="/" className="site-brand-link">
          {brandName}
        </a>
      </div>
      <AuthBar audience={audience} />
    </header>
  );
}
