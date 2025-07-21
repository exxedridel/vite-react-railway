import React, { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import { Eye, EyeOff, AlertCircle, Waves, HandCoins } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const FormSchema = z.object({
  email: z.string().email({
    message: "Ingresa correo válido",
  }),
  password: z.string().min(1, {
    message: "Campo requerido",
  }),
});

const Login = () => {
  const { login, navigate, isIdle } = useAppContext();
  const [showPassword, setShowPassword] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    try {
      const bearer_token = localStorage.getItem("bearer_token");
      if (bearer_token) {
        navigate("/dashboard");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShouldRender(true);
    }, 100);
    return () => clearTimeout(timeout);
  }, []);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    try {
      await login(data).then(() => {
        setShowPassword(false);
        form.reset({
          ...form.getValues(),
          password: "",
        });
      });
    } catch (err) {
      console.log(err);
    }
  }

  return shouldRender ? (
    <div className="min-h-[500px] h-[100dvh] flex flex-col gap-4 items-center justify-center p-3 bg-gradient-to-t from-[--brand] to-[--brand-light]">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          autoComplete="off"
          className="w-full sm:w-[360px]  p-5 space-y-6"
        >
          <div className="flex flex-col items-center justify-center">
            {/* <img
                src="/credit-control.webp"
                alt="cc-logo"
                width={125}
                height={125}
                className="m-5"
              /> */}
            <h1 className="mb-6 text-[30px] italic flex flex-col justify-center items-center gap-2">
              <HandCoins className="text-brand ml-4" size={90}/>
              <span className="font-bold">CreditControl</span> 
            </h1>
            <span className="text-3xl">Inicia Sesión</span>
          </div>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Correo</FormLabel>
                <FormControl>
                  <Input autoComplete="off" {...field} />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contraseña</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="off"
                      {...field}
                    />
                    <button
                      type="button"
                      className="text-xs absolute right-3 top-1/2 transform -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="text-primary/50 h-5 w-5" />
                      ) : (
                        <Eye className="text-primary/50 h-5 w-5" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="w-full">
            Ingresar
          </Button>
        </form>
      </Form>
    </div>
  ) : null;
};

export default Login;
