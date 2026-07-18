"use client";
import { useEffect, useState, useCallback } from "react";
import { api, type UserOut, type UserCreate, type UserUpdate } from "@/lib/api";

export function useUsers() {
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    api.users().then(setUsers).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function create(body: UserCreate) {
    const created = await api.createUser(body);
    setUsers(prev => [...prev, created]);
    return created;
  }

  async function update(id: string, body: UserUpdate) {
    const updated = await api.updateUser(id, body);
    setUsers(prev => prev.map(u => u.id === id ? updated : u));
    return updated;
  }

  async function remove(id: string) {
    await api.deleteUser(id);
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  return { users, loading, actions: { create, update, remove } };
}
