import { create } from 'zustand';

export type ModalType = 'profile' | 'join';

export interface ModalData {
  name: string;
  avatar: string;
  game: string;
}

interface ModalState {
  isOpen: boolean;
  type: ModalType | null;
  data: ModalData | null;
  showModal: (type: ModalType, data: ModalData) => void;
  hideModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: null,
  data: null,
  showModal: (type, data) => set({ isOpen: true, type, data }),
  hideModal: () => set({ isOpen: false, type: null, data: null }),
}));
