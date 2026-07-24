import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isSeller } from "@/lib/current-user";
import { ProductForm } from "@/components/product-form";
import { updateProduct } from "../../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isSeller(user)) redirect("/dashboard");

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.sellerId !== user.id) notFound();

  return (
    <div className="animate-page-in mx-auto max-w-lg lg:mx-0">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Edit product</h1>
      <p className="mb-6 text-sm text-muted">Update details for this product.</p>
      <ProductForm
        action={updateProduct.bind(null, product.id)}
        submitLabel="Save changes"
        defaultValues={{
          title: product.title,
          priceRupees: product.priceInPaise / 100,
          stock: product.availableStock,
          imageUrl: product.imageUrl,
          weightGrams: product.weightGrams,
          lengthCm: product.lengthCm,
          breadthCm: product.breadthCm,
          heightCm: product.heightCm,
        }}
      />
    </div>
  );
}
