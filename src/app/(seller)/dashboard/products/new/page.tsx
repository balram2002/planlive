import { redirect } from "next/navigation";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { ProductForm } from "@/components/product-form";
import { createProduct } from "../../actions";

export default async function NewProductPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  return (
    <div className="animate-page-in mx-auto max-w-lg lg:mx-0">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">New product</h1>
      <p className="mb-6 text-sm text-muted">
        Add a product you can sell during a live stream.
      </p>
      <ProductForm action={createProduct} submitLabel="Create product" />
    </div>
  );
}
