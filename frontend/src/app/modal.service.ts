import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface ModalState {
  show: boolean;
  title: string;
  message: string;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalState = new BehaviorSubject<ModalState>({
    show: false,
    title: '',
    message: '',
    isConfirm: false,
    resolve: (_: boolean) => {}
  });

  public readonly modal$: Observable<ModalState> = this.modalState.asObservable();

  constructor() { }

  showAlert(title: string, message: string): void {
    this.modalState.next({ show: true, title, message, isConfirm: false, resolve: (_: boolean) => {} });
  }

  showConfirm(title: string, message: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.modalState.next({
        show: true,
        title,
        message,
        isConfirm: true,
        resolve: (value: boolean) => {
          resolve(value);
        }
      });
    });
  }

  closeModal(result: boolean): void {
    const currentState = this.modalState.getValue();
    this.modalState.next({ ...currentState, show: false }); // Ocultamos el modal siempre
    if (currentState.show && currentState.resolve) {
      currentState.resolve(result);
    }
  }
}