import type { ModalStore } from '@/lib/types/party/middleware';

import { create } from 'zustand';

export const useModalStore = create<ModalStore>((set) => ({
  isOpen: false,
  type: null,
  data: null,
  showModal: (type, data) => set({ isOpen: true, type, data }),
  hideModal: () => set({ isOpen: false, type: null, data: null }),
}));
