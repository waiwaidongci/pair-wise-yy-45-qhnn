import { configureStore } from '@reduxjs/toolkit'
import { samplingApi } from './api'
import { developmentReducer, persistKey } from '../features/developmentSlice'

export const store = configureStore({
  reducer: {
    development: developmentReducer,
    [samplingApi.reducerPath]: samplingApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(samplingApi.middleware),
})

store.subscribe(() => {
  localStorage.setItem(persistKey, JSON.stringify(store.getState().development))
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
