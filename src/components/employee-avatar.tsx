import { cn } from "@/lib/utils";

/** The employee's photo, or the first letter of the name when there is none. `className` sets size, shape and the letter colours. */
export function EmployeeAvatar({ name, photo, className, eager = false }: { name: string; photo?: string | null; className?: string; eager?: boolean }) {
  if (photo) {
    return <img src={photo} alt="" loading={eager ? "eager" : "lazy"} decoding="async" className={cn("shrink-0 object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center font-bold", className)}>
      {name.trim().slice(0, 1)}
    </span>
  );
}
