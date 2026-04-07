import { Header } from './components/Header/Header';
import { MainLayout } from './components/MainLayout';
import { StatusBar } from './components/StatusBar/StatusBar';

function App() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <Header />
      <MainLayout />
      <StatusBar />
    </div>
  );
}

export default App;
