import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router";
import logoHorizontal from "@/assets/brand/logo-horizontal.png";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/contexts/AuthContext";
import { useFavicon } from "@/hooks/use-favicon";
import { Button } from "@/components/ui/Button";
import { GoogleButton } from "@/components/ui/GoogleButton";

const schema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Mínimo de 6 caracteres"),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  useFavicon("/app-icon.png");
  const { signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [entrandoComGoogle, setEntrandoComGoogle] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setErro(null);
    try {
      await signIn(values.email, values.password);
      navigate("/");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao entrar");
    }
  }

  async function onGoogleClick() {
    setErro(null);
    setEntrandoComGoogle(true);
    try {
      await signInWithGoogle();
      navigate("/");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao entrar com Google");
      setEntrandoComGoogle(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="card-surface w-full max-w-sm space-y-5 p-8"
      >
        <div>
          <img src={logoHorizontal} alt="Poupeu" className="h-8 w-auto" />
          <h1 className="mt-2 text-xs tracking-wide text-muted-foreground uppercase">
            Entrar na conta
          </h1>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-foreground/80">E-mail</label>
          <input
            type="email"
            {...register("email")}
            className="w-full rounded-[11px] border border-border bg-muted px-3 py-2 text-[13px] text-foreground"
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-foreground/80">Senha</label>
          <div className="relative">
            <input
              type={mostrarSenha ? "text" : "password"}
              {...register("password")}
              className="w-full rounded-[11px] border border-border bg-muted px-3 py-2 pr-10 text-[13px] text-foreground"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {mostrarSenha ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground uppercase">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <GoogleButton
          label={entrandoComGoogle ? "Conectando..." : "Continuar com Google"}
          disabled={entrandoComGoogle}
          onClick={onGoogleClick}
        />

        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link to="/signup" className="font-medium text-foreground underline">
            Criar conta
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          <Link to="/termos" className="underline hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          ·{" "}
          <Link to="/privacidade" className="underline hover:text-foreground">
            Política de Privacidade
          </Link>
        </p>
      </form>
    </div>
  );
}
