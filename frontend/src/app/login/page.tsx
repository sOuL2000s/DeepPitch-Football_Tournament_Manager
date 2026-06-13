'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function Login() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: any) => {
    try {
      const res = await api.post('/auth/login', data);
      setAuth(res.data.access_token, { email: data.email });
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-secondary p-8 border border-zinc-800">
        <h2 className="text-3xl font-bold text-center text-foreground">Welcome Back</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-300">Email</label>
            <input {...register('email')} className="w-full p-2 bg-background border border-zinc-700 rounded-md text-foreground" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message as string}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-zinc-300">Password</label>
            <input type="password" {...register('password')} className="w-full p-2 bg-background border border-zinc-700 rounded-md text-foreground" />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message as string}</p>}
          </div>
          <button type="submit" className="w-full py-2 bg-primary text-white rounded-md hover:bg-emerald-500 font-medium transition-colors">
            Sign In
          </button>
        </form>
        <p className="text-center text-sm text-zinc-400">
          Don't have an account? <Link href="/register" className="text-primary hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}