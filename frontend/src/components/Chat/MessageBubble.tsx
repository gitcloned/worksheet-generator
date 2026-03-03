import type { ChatMessage } from '../../types';
import { PracticeTest } from '../PracticeTest/PracticeTest';
import { ResearchPanel } from '../ResearchPanel/ResearchPanel';
import { BlueprintCard } from '../BlueprintCard/BlueprintCard';

type Props = {
  message: ChatMessage;
  userId: string;
  sessionId: string;
  sendMessage: (text: string) => void;
  isLoading: boolean;
};

export function MessageBubble({ message, userId, sessionId, sendMessage, isLoading }: Props) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-xs rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
        AI
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {message.content && (
          <div className="inline-block max-w-sm rounded-2xl rounded-tl-sm bg-white border border-gray-200 px-4 py-2.5 text-sm text-gray-800 shadow-sm whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {message.research && (
          <ResearchPanel
            research={message.research}
            sendMessage={sendMessage}
            isLoading={isLoading}
          />
        )}
        {message.blueprint && (
          <BlueprintCard
            blueprint={message.blueprint}
            sendMessage={sendMessage}
            isLoading={isLoading}
          />
        )}
        {message.artifact && (
          <PracticeTest test={message.artifact} userId={userId} sessionId={sessionId} />
        )}
      </div>
    </div>
  );
}
