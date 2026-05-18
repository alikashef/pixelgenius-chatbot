import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
}
